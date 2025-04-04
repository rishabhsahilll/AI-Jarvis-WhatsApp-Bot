const { Groq } = require('groq-sdk');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const Assistantname = process.env.Assistantname || "BRO A.I";
const { fetchWithRetry, ensureDir, getPersonalSummary, updatePersonalSummary } = require('./chatbot');

function customSanitize(input) { // Added for consistency
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
    const sanitizedUsername = customSanitize(username); // Updated
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
        await require('./chatbot').moveToOldChatlog(sanitizedUsername); // Updated
        messages = messages.slice(-5);
    }

    messages.push({ role: "user", content: query, timestamp: new Date().toISOString() });
    messages = messages.slice(-5);

    const apiMessages = messages.map(({ role, content }) => ({ role, content }));
    const recentContext = messages.slice(-5).map(m => `${m.role}: ${m.content}`).join("\n");
    const personalSummary = await getPersonalSummary(sanitizedUsername); // Updated

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
    You are ${Assistantname}, a fun AI dost for ${sanitizedUsername.replace("_"," ") || "mera dost"}.  
📅 **Date:** ${getRealtimeInformation()}  

💬 **Refined Query:** "${refinedQuery}"  
🕒 **Last 3 Messages:** "${recentContext}"  
ℹ️ **User Personal info:** "${personalSummary}"  
🎭 **Mood:** "${mood}"  

⚡ **Music Suggestion Rules:**  
✅ **User ke mood aur query ke basis pe ek short, fun aur cool music suggestion de!**  
✅ **Agar user ka fav singer (e.g., "Honey Singh") personal info mein hai, toh priority de!**  
✅ **No repeats—hamesha naye aur fresh suggestions!**  
✅ **Agar user bole "play," "YouTube link do," ya "dekhna," toh decide kar link chahiye ya nahi!**  
✅ **Agar link chahiye, toh context ke according decide kar:**  
   - **"Dekhna" ya "watch" ho, toh video link:** \`[video:<query>]\`  
   - **Baaki cases mein music link:** \`[music:<query>]\`  
✅ **Ek dost ki tarah baat kar—no robotic vibes!**  

🎧 **Example Response Format:**  
- **Mood Match + Fav Singer:** \`"Bhai, tu chill mode pe hai? Yeh lo ek vibe-heavy Honey Singh track! 🎶 [music:Honey Singh latest]"\`  
- **YouTube Video Request:** \`"Full enjoy karna hai? Yeh raha tera gaana! 📺 [video:Desi Kalakaar]"\`
✅ **WhatsApp style use kar (*bold*, __italic__, ~~strikethrough~~, *list, - etc.)!**  

👨‍💻 **Developer Info:**  
Banaya hai mere dost **Rishabh Kumar**, ek **3 saal ka experienced full-stack developer**.  
📸 *Instagram*: https://instagram.com/rishabhsahill
📘 *Facebook*: https://www.facebook.com/rishabhsahill
🐦 *X (Twitter)*: https://x.com/rishabhsahill
💻 *GitHub*: https://github.com/rishabhsahilll  
🕶️ *Anti-social media*: https://netrarsy.pythonanywhere.com
🔍 *Rishabh Search Engine (R.S.E)*: https://rishabhsahilll.github.io/rishabh-search-engine
🎨 *Portfolio: https*://rishabhsahil.vercel.app
🔗 *All Social Media*: https://bento.me/rishabhsahil
📞 *Developer Contac*t: https://ig.me/m/rishabhsahill

🤔 **koi puchhe to hi Full form batna!**  
👉 **"${Assistantname}" ka full form "Bhart Robotic Organizations Artificial Intelligence" hai.**  

🔥 **Follow karna mat bhulna, bhai!** 😎  
`;

    try {
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
            await require('./chatbot').moveToOldChatlog(sanitizedUsername); // Updated
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

        messages.push({ role: "assistant", content: answer, timestamp: new Date().toISOString() });
        await fs.writeFile(chatlogPath, JSON.stringify(messages, null, 4), 'utf-8');
        return answer.trim() || "Koi gana nahi mila, bhai! 😜";
    } catch (e) {
        console.error(`\n\n❌ Play Error: ${e.message}`);
        return "Bhai, music mein thodi si dikkat! Try again! 😜";
    }
}

module.exports = { playMusicRecommendation };