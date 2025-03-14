const { Groq } = require('groq-sdk');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const Assistantname = process.env.Assistantname || "Jarvis";
const { fetchWithRetry, ensureDir, getPersonalSummary, updatePersonalSummary } = require('./chatbot');

function getRealtimeInformation() {
    const now = new Date();
    return `${now.getDate()} ${now.toLocaleString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' })} ${now.getFullYear()}, ${now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
}

async function getYouTubeLink(query, isVideo = false) {
    const searchQuery = isVideo ? query : `${query} song`;
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    try {
        const response = await axios.get(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        const videoId = response.data.match(/"videoId":"(.*?)"/)?.[1];
        const title = response.data.match(/"title":{"runs":\[{"text":"(.*?)"}\]/)?.[1] || "Unknown Title";
        if (!videoId) return null;
        const baseLink = isVideo ? `https://www.youtube.com/watch?v=${videoId}` : `https://music.youtube.com/watch?v=${videoId}`;
        return `${baseLink} - ${title}`;
    } catch (e) {
        console.error(`\n\nYouTube Search Error: ${e.message}`);
        return null;
    }
}

async function playMusicRecommendation(query, username) {
    const chatlogPath = path.join(__dirname, `Data/${username}/${username}-ChatLog.json`);
    // console.log(`\n\nplayMusicRecommendation called for ${username} with query: ${query}`);
    await ensureDir(chatlogPath);
    let messages = await fs.readFile(chatlogPath, 'utf-8').then(JSON.parse).catch(() => []);

    // Check if messages exceed 20, move older ones to Old folder
    if (messages.length >= 20) {
        // console.log(`\n\nMessage count ${messages.length} exceeded 20, moving old chats for ${username}`);
        await require('./chatbot').moveToOldChatlog(username);
        messages = messages.slice(-5);
        // console.log(`\n\nTrimmed to last 5 messages: ${JSON.stringify(messages)}`);
    }

    messages.push({ role: "user", content: query, timestamp: new Date().toISOString() });
    messages = messages.slice(-5);

    const apiMessages = messages.map(({ role, content }) => ({ role, content }));
    const recentContext = messages.slice(-5).map(m => `${m.role}: ${m.content}`).join("\n");
    const personalSummary = await getPersonalSummary(username);

    const moodPrompt = `
    You are a smart AI detecting the user's mood. Query: "${query}". Last 3 messages: "${recentContext}".
    - Analyze the query and context to determine the mood (e.g., playful, serious, sad).
    - Return the mood as a single word (e.g., "playful") or "neutral" if unclear.
    - No explanations!
    `;
    const moodResponse = await fetchWithRetry(client =>
        client.chat.completions.create({
            model: "llama3-70b-8192",
            messages: [{ role: "system", content: moodPrompt }],
            temperature: 0.5,
            max_tokens: 20
        })
    );
    const mood = moodResponse?.choices[0].message.content.trim() || "neutral";

    const intentPrompt = `
    You are a smart AI figuring out what the user wants. Query: "${query}". Last 3 messages: "${recentContext}". Personal info: "${personalSummary}".
    - Analyze the query, context, and personal info to deduce the user's music-related intent.
    - Use the favorite singer from personal info if mentioned (e.g., "Honey Singh").
    - Return a refined query (e.g., "Play Lungi Dance by Honey Singh") or "None" if unclear.
    - Keep it short, no explanations!
    `;
    const intentResponse = await fetchWithRetry(client =>
        client.chat.completions.create({
            model: "llama3-70b-8192",
            messages: [{ role: "system", content: intentPrompt }],
            temperature: 0.5,
            max_tokens: 50
        })
    );
    const refinedQuery = intentResponse?.choices[0].message.content.trim() || "None";

    const systemPrompt = `
    You are ${Assistantname}, a fun AI dost for ${username.replace("_"," ") || "mera dost"}. Date: ${getRealtimeInformation()}.
    - Refined Query: "${refinedQuery}". Last 3 messages: "${recentContext}". Personal info: "${personalSummary}". Mood: "${mood}".
    - Suggest music in Hinglish with emojis based on the refined query, context, and mood. Keep it short and cool!
    - Use personal info (e.g., fav singer "Honey Singh") if relevant. No repeats!
    - Decide whether to include a YouTube link based on the user's intent (e.g., "play," "youtube link do," "dekhna").
    - If a link is needed, decide if it’s a video link (https://www.youtube.com) or music link (https://music.youtube.com) based on context (e.g., "dekhna" or "watch" for video, otherwise music).
    - To include a link, use the format: "[video:<query>]" for video or "[music:<query>]" for music in your response, and I'll replace it with the actual link.
    - Banaya hai mere dost Rishabh Sahil ne—3 saal ka experience wala full stack developer, Insta: https://instagram.com/rishabhsahill, GitHub: https://github.com/rishabhsahilll, aur uska cool anti-social media: https://netrarsy.pythonanywhere.com 😎, or Rishabh Search Enigne (R.S.E): https://rishabhsahilll.github.io/rishabh-search-engine/, Protfolio: https://portfolio-flask-application.vercel.app/
    `;

    try {
        // console.log(`\n\nMusic recommendation for: ${query}`);
        const completion = await fetchWithRetry(client =>
            client.chat.completions.create({
                model: "llama3-70b-8192",
                messages: [{ role: "system", content: systemPrompt }, ...apiMessages],
                temperature: 0.9,
                max_tokens: 1024,
                stream: true,
            })
        );

        if (!completion) {
            await require('./chatbot').moveToOldChatlog(username);
            return "Arre, gana suggest karte waqt thodi si gadbad! 😅";
        }

        let answer = "";
        for await (const chunk of completion) {
            if (chunk.choices[0].delta.content) answer += chunk.choices[0].delta.content;
        }

        const videoMatch = answer.match(/\[video:(.*?)\]/);
        const musicMatch = answer.match(/\[music:(.*?)\]/);
        if (videoMatch) {
            const youtubeLink = await getYouTubeLink(videoMatch[1], true);
            if (youtubeLink) answer = answer.replace(videoMatch[0], youtubeLink);
        } else if (musicMatch) {
            const youtubeLink = await getYouTubeLink(musicMatch[1], false);
            if (youtubeLink) answer = answer.replace(musicMatch[0], youtubeLink);
        }

        // console.log(`\n\nMusic response: ${answer}`);
        messages.push({ role: "assistant", content: answer, timestamp: new Date().toISOString() });
        await fs.writeFile(chatlogPath, JSON.stringify(messages, null, 4), 'utf-8');
        return answer.trim() || "Koi gana nahi mila, bhai! 😜";
    } catch (e) {
        console.error(`\n\n❌ Play Error: ${e.message}`);
        return "Bhai, music mein thodi si dikkat! Try again! 😜";
    }
}

module.exports = { playMusicRecommendation };