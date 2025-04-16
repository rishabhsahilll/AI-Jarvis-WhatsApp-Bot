const { Groq } = require('groq-sdk');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const lyricsFinder = require('lyrics-finder');
require('dotenv').config();

const Assistantname = process.env.Assistantname || "BRO A.I";
const { fetchWithRetry, ensureDir, getPersonalSummary } = require('./chatbot');

function customSanitize(input) {
    if (!input) return 'default_user';
    return input
        .replace(/[^\w\s-]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .trim() || 'default_user';
}

function getRealtimeInformation() {
    const now = new Date();
    return `${now.getDate()} ${now.toLocaleString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' })} ${now.getFullYear()}, ${now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
}

async function moveToOldChatlog(username) {
    const sanitizedUsername = customSanitize(username); // Ensure sanitization
    const chatlogPath = path.join(__dirname, `Data/${sanitizedUsername}/${sanitizedUsername}-ChatLog.json`);
    const oldChatlogDir = path.join(__dirname, `Data/${sanitizedUsername}/Old`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const oldChatlogPath = path.join(oldChatlogDir, `${sanitizedUsername}-ChatLog-${timestamp}.json`);

    await ensureDir(oldChatlogPath);
    let messages;
    try {
        messages = await fs.readFile(chatlogPath, 'utf-8').then(JSON.parse);
    } catch (e) {
        if (e.code === 'ENOENT') {
            await fs.writeFile(chatlogPath, JSON.stringify([], null, 4), 'utf-8');
            messages = [];
        } else {
            messages = [];
        }
    }
    if (messages.length > 0) {
        await fs.writeFile(oldChatlogPath, JSON.stringify(messages, null, 4), 'utf-8');
        await fs.writeFile(chatlogPath, JSON.stringify(messages.slice(-5), null, 4), 'utf-8');
    }
}

async function getYouTubeLink(query, isVideo = false) {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + (isVideo ? " video" : " song"))}`;
    try {
        const response = await axios.get(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        const videoId = response.data.match(/"videoId":"(.*?)"/)?.[1];
        const title = response.data.match(/"title":{"runs":\[{"text":"(.*?)"}\]/)?.[1] || "Unknown Title";
        const description = response.data.match(/<meta name="description" content="([\s\S]*?)">/)?.[1] || "";
        return videoId ? { url: `${isVideo ? "https://www.youtube.com" : "https://music.youtube.com"}/watch?v=${videoId}`, title, description } : null;
    } catch (e) {
        console.error(`YouTube Link Error: ${e.message}`);
        return null;
    }
}

async function refineQueryFromYouTube(query) {
    const youtubeData = await getYouTubeLink(query, true);
    if (!youtubeData) return query;

    const { title, description } = youtubeData;
    const systemPrompt = `
    You are a smart AI refining user queries for lyrics using YouTube data. Date: ${getRealtimeInformation()}.
    - Original query: "${query}".
    - YouTube title: "${title}".
    - YouTube description: "${description.slice(0, 200)}...".
    - Extract artist and song title from the title and description.
    - Common artists: shubh, ap dhillon, honey singh, yo yo honey singh, pawan singh, arijit singh, diljit dosanjh, khesari lal yadav, neha kakkar, badshah.
    - Remove extra words (e.g., "lyrics", "video", "official", "song").
    - Format as "artist - song title" (e.g., "ap dhillon - brown munde").
    - If no clear artist or song, return the original query.
    - Return ONLY the refined query, no extra text!
    `;
    try {
        const response = await fetchWithRetry(client =>
            client.chat.completions.create({
                model: "llama3-70b-8192",
                messages: [{ role: "system", content: systemPrompt }],
                temperature: 0.5,
                max_tokens: 50
            })
        );
        return response?.choices[0].message.content.trim() || query;
    } catch (e) {
        console.error(`❌ YouTube Query Refinement Error: ${e.message}`);
        return query;
    }
}

async function fetchRealLyrics(artist, songTitle) {
    if (!songTitle || songTitle === "unknown" || songTitle === "undefined") return { lyrics: "Lyrics nahi mile, bhai!", source: null };
    const searchQuery = artist ? `${artist} ${songTitle}` : songTitle;
    console.log(`Fetching real lyrics for: "${searchQuery}"`);
    let lyrics = null, source = null;

    try {
        lyrics = await lyricsFinder(artist || songTitle, songTitle);
        if (lyrics && lyrics.length > 50) {
            console.log("Lyrics found via lyrics-finder");
            console.log(`Raw lyrics: ${lyrics.slice(0, 100)}...`);
            source = "lyrics-finder (source not directly linkable)";
            return { lyrics, source };
        } else {
            console.log("lyrics-finder: Lyrics too short or not found");
        }
    } catch (e) {
        console.log(`lyrics-finder failed: ${e.message}`);
    }

    if (!lyrics) {
        try {
            const geniusUrl = `https://genius.com/api/search?q=${encodeURIComponent(searchQuery)}`;
            const geniusResponse = await axios.get(geniusUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
            const hits = geniusResponse.data.response.hits;
            let songPath = null;

            for (const hit of hits) {
                if (hit.result.primary_artist.name.toLowerCase().includes(artist.toLowerCase()) && 
                    hit.result.title.toLowerCase().includes(songTitle.toLowerCase())) {
                    songPath = hit.result.path;
                    break;
                }
            }
            songPath = songPath || hits[0]?.result.path;

            if (songPath) {
                const songUrl = `https://genius.com${songPath}`;
                console.log(`Genius URL: ${songUrl}`);
                const songPage = await axios.get(songUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
                const lyricsMatch = songPage.data.match(/<div[^>]*class="Lyrics__Container.*?>([\s\S]*?)<\/div>/i);
                lyrics = lyricsMatch ? lyricsMatch[1].replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim() : null;
                if (lyrics && lyrics.length > 50) {
                    console.log("Lyrics found via Genius");
                    console.log(`Raw lyrics: ${lyrics.slice(0, 100)}...`);
                    source = songUrl;
                    return { lyrics, source };
                }
            }
        } catch (e) {
            console.log(`Genius failed: ${e.message}`);
        }
    }

    if (!lyrics && artist) {
        try {
            const azSearch = `${artist}${songTitle}`.split(" ").join("").toLowerCase();
            const azUrl = `https://www.azlyrics.com/lyrics/${azSearch}.html`;
            const azResponse = await axios.get(azUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
            const lyricsMatch = azResponse.data.match(/<!-- Usage of azlyrics.com content -->.*?<div>(.*?)<div/i);
            lyrics = lyricsMatch ? lyricsMatch[1].replace(/<[^>]+>/g, "\n").trim() : null;
            if (lyrics && lyrics.length > 50) {
                console.log("Lyrics found via AZLyrics");
                console.log(`Raw lyrics: ${lyrics.slice(0, 100)}...`);
                source = azUrl;
                return { lyrics, source };
            }
        } catch (e) {
            console.log(`AZLyrics failed: ${e.response?.status || e.message}`);
        }
    }

    console.log("No real lyrics found");
    return { lyrics: "Lyrics nahi mile, bhai!", source: null };
}

async function generateNewQuery(query, recentContext) {
    const systemPrompt = `
    You are a smart AI refining user queries for lyrics. Date: ${getRealtimeInformation()}.
    - Current query: "${query}".
    - Last 3 messages: "${recentContext}".
    - Separate artist and song title if present, and refine into "artist - song title".
    - Detect common artists (e.g., shubh, ap dhillon, honey singh, yo yo honey singh, pawan singh, arijit singh, diljit dosanjh, khesari lal yadav, neha kakkar, badshah).
    - Remove extra words (e.g., "suno", "achha", "hme", "ka", "likho", "song", "lyrics").
    - If no artist is found but a song title is clear, assume a likely artist (e.g., "Brown Munde" -> "AP Dhillon - Brown Munde").
    - If no song title is found, return "artist - unknown".
    - Return ONLY the refined query (e.g., "ap dhillon - brown munde"), no extra text!
    `;
    try {
        const response = await fetchWithRetry(client =>
            client.chat.completions.create({
                model: "llama3-70b-8192",
                messages: [{ role: "system", content: systemPrompt }],
                temperature: 0.5,
                max_tokens: 50
            })
        );
        return response?.choices[0].message.content.trim() || query;
    } catch (e) {
        console.error(`❌ Query Generation Error: ${e.message}`);
        return query;
    }
}

async function fetchLyrics(query, username) {
    const sanitizedUsername = customSanitize(username); // Already correct
    const chatlogPath = path.join(__dirname, `Data/${sanitizedUsername}/${sanitizedUsername}-ChatLog.json`);
    await ensureDir(chatlogPath);
    let messages;
    try {
        messages = await fs.readFile(chatlogPath, 'utf-8').then(JSON.parse);
    } catch (e) {
        if (e.code === 'ENOENT') {
            await fs.writeFile(chatlogPath, JSON.stringify([], null, 4), 'utf-8');
            messages = [];
        } else {
            messages = [];
        }
    }

    if (messages.length >= 20) {
        await moveToOldChatlog(sanitizedUsername); // Updated to use sanitizedUsername
        messages = messages.slice(-5);
    }

    messages.push({ role: "user", content: query, timestamp: new Date().toISOString() });
    messages = messages.slice(-5);

    const apiMessages = messages.map(({ role, content }) => ({ role, content }));
    const recentContext = messages.slice(-3).map(m => `${m.role}: ${m.content}`).join("\n");
    const personalSummary = await getPersonalSummary(sanitizedUsername);

    let refinedQuery = await generateNewQuery(query, recentContext);
    console.log(`Initial refined query: "${refinedQuery}"`);

    refinedQuery = await refineQueryFromYouTube(refinedQuery);
    console.log(`YouTube-refined query: "${refinedQuery}"`);

    const [artist, songTitle] = refinedQuery.split(" - ").map(s => s.trim());
    const isVideoRequest = query.toLowerCase().includes("video");
    const wantsAIGenerated = query.toLowerCase().includes("khud se banao") || query.toLowerCase().includes("khud se lyric likho") || query.toLowerCase().includes("imagine");

    let rawLyrics, lyricsSource, musicLink, videoLink;
    if (wantsAIGenerated) {
        const aiLyricsPrompt = `
        You are ${Assistantname}, creating original lyrics for ${sanitizedUsername.replace("_"," ") || "mera dost"}.
        - Query: "${query}". Refined: "${refinedQuery}". Context: "${recentContext}".
        - Generate short, fun lyrics in Hinglish or the song's likely language (e.g., Bhojpuri for Pawan Singh).
        - No links, just lyrics!
        - Example format: "<verse1>\n<verse2>\n<chorus>"
        `;
        const completion = await fetchWithRetry(client =>
            client.chat.completions.create({
                model: "llama3-70b-8192",
                messages: [{ role: "system", content: aiLyricsPrompt }],
                temperature: 1.0,
                max_tokens: 300
            })
        );
        rawLyrics = completion?.choices[0].message.content.trim() || "Kuchh banane mein thodi gadbad ho gayi! 😅";
        lyricsSource = null;
        musicLink = videoLink = null;
    } else {
        const lyricsResult = await fetchRealLyrics(artist, songTitle);
        rawLyrics = lyricsResult.lyrics;
        lyricsSource = lyricsResult.source;
        const youtubeData = await getYouTubeLink(refinedQuery, false);
        musicLink = youtubeData ? youtubeData.url + " - " + youtubeData.title : null;
        videoLink = isVideoRequest ? (await getYouTubeLink(refinedQuery, true))?.url : null;
    }

    const systemPrompt = `
    You are ${Assistantname}, a dost-like AI for ${sanitizedUsername.replace("_"," ") || "mera dost"}.
    *Date:* ${getRealtimeInformation()}
    *Query:* "${query}"
    *Refined:* "${refinedQuery}"
    *Last 3 messages:* "${recentContext}"
    *User Personal info:* "${personalSummary}"
    *Raw lyrics:* "${rawLyrics}"
    *Lyrics source:* "${(lyricsSource || "Source nahi mila")}"
    *Music link:* "${(musicLink || "Link nahi mila")}"
    *Video link (if asked):* "${(videoLink || "Nahi maanga")}"
    *Logic for Lyrics Handling:*
    - *AI-generated lyrics (user asked "khud se banao" ya "imagine")* ➝ "Yeh raha tera gaana ka lyric: ${rawLyrics}"
    - *Real lyrics mile* ➝ "Yeh raha tera gaana ka lyric: ${rawLyrics}\nLyrics yahan se: ${lyricsSource}\nSuna bhi le: ${musicLink}"
    - *Lyrics nahi mile* ➝ "Lyrics to mere paas nahi hai, par yeh lo, suno aur vibe karo: ${musicLink} 🎶"
    *Response Hinglish mein, short aur fun.*
    *WhatsApp style use kar (*bold*, __italic__, ~~strikethrough~~, *list, - etc.)!*  
    *Koi bhi baat repeat mat kar—hamesha fresh aur engaging answer de!*
    *Ek real dost ki tarah baat kar—koi robotic vibes nahi!*  
    *Emoji use na kar jb tak jarurat na ho*
    *SIRF RAW DATA USE KARO* for real lyrics, no editing!
    *Developer Info:*
    Banaya hai mere dost *Rishabh Kumar*, ek *3 saal ka experienced full-stack developer*.
    *Instagram*: https://instagram.com/rishabhsahill
    *Facebook*: https://www.facebook.com/rishabhsahill
    *X (Twitter)*: https://x.com/rishabhsahill
    *GitHub*: https://github.com/rishabhsahilll
    *Anti-social media*: https://netrarsy.pythonanywhere.com
    *Rishabh Search Engine (R.S.E)*: https://rishabhsahilll.github.io/rishabh-search-engine
    *Portfolio*: https://rishabhsahil.vercel.app
    *All Social Media*: https://bento.me/rishabhsahil
    *Developer Contact*: https://ig.me/m/rishabhsahill
    *koi puchhe to hi Full form batna!*
    *"${Assistantname}" ka full form "Bhart Robotic Organizations Artificial Intelligence" hai.*
    *Follow karna mat bhulna, bhai!*
    `;

    try {
        const completion = await fetchWithRetry(client =>
            client.chat.completions.create({
                model: "llama3-70b-8192",
                messages: [{ role: "system", content: systemPrompt }, ...apiMessages],
                temperature: 0.8,
                max_tokens: 1024,
                stream: true,
            })
        );

        if (!completion) {
            console.log("Groq API failed, using fallback");
            await moveToOldChatlog(sanitizedUsername);
            return wantsAIGenerated ? "Arre, lyrics banane mein thodi gadbad! 😅" : "Lyrics mein thodi dikkat aa gayi! Yeh lo music link: " + (musicLink || "Link bhi nahi mila! 😅");
        }

        let answer = "";
        for await (const chunk of completion) {
            if (chunk.choices[0].delta.content) answer += chunk.choices[0].delta.content;
        }

        console.log(`Final response: ${answer}`);

        messages.push({ role: "assistant", content: answer, timestamp: new Date().toISOString() });
        await fs.writeFile(chatlogPath, JSON.stringify(messages, null, 4), 'utf-8');

        return answer.trim() || "Kuchh toh bol, bhai! 😜";
    } catch (e) {
        console.error(`❌ Lyrics Error: ${e.message}`);
        await moveToOldChatlog(sanitizedUsername);
        return wantsAIGenerated ? "Lyrics banane mein dikkat! 😅" : "Lyrics mein thodi dikkat aa gayi! Yeh lo music link: " + (musicLink || "Link bhi nahi mila! 😅");
    }
}

module.exports = { fetchLyrics, moveToOldChatlog };