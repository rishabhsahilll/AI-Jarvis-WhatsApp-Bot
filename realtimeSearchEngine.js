const { Groq } = require('groq-sdk');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const Assistantname = process.env.Assistantname || "BRO A.I";
const { fetchWithRetry, ensureDir, getPersonalSummary } = require('./chatbot');

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

function getCurrentYear() {
    return new Date().getFullYear();
}

async function fetchGoogleSearch(query) {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cx = process.env.GOOGLE_CX;
    try {
        const response = await axios.get(`https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}`);
        return response.data.items[0]?.snippet || "Kuchh nahi mila, bhai!";
    } catch (e) {
        console.error(`\n\nGoogle Search Error: ${e.message}`);
        return "Search mein thodi dikkat hai!";
    }
}

async function RealtimeSearchEngine(query, username) {
    const sanitizedUsername = customSanitize(username); // Updated to use customSanitize
    const chatlogPath = path.join(__dirname, `Data/${sanitizedUsername}/${sanitizedUsername}-ChatLog.json`);
    await ensureDir(chatlogPath);
    let messages = await fs.readFile(chatlogPath, 'utf-8').then(JSON.parse).catch(() => []);

    if (messages.length >= 20) {
        await require('./chatbot').moveToOldChatlog(sanitizedUsername); // Updated
        messages = messages.slice(-5);
    }

    messages.push({ role: "user", content: query, timestamp: new Date().toISOString() });
    messages = messages.slice(-5);

    const apiMessages = messages.map(({ role, content }) => ({ role, content }));
    const recentContext = messages.slice(-3).map(m => `${m.role}: ${m.content}`).join("\n");
    const personalSummary = await getPersonalSummary(sanitizedUsername); // Updated

    const intentPrompt = `
    You are a smart AI figuring out what the user wants. Query: "${query}". Last 3 messages: "${recentContext}".
    - Analyze the query and context to deduce the user's real-time info intent.
    - Use the current year (${getCurrentYear()}) if a year isn’t specified (e.g., "Holi kab hai" → "When is Holi in ${getCurrentYear()}").
    - Return a refined query (e.g., "When is Holi in ${getCurrentYear()}") or "None" if unclear.
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
    const liveData = refinedQuery !== "None" ? await fetchGoogleSearch(refinedQuery) : "Kuchh nahi mila, bhai!";

    const systemPrompt = `
    You are ${Assistantname}, a quick AI dost for ${sanitizedUsername.replace("_"," ") || "mera dost"}.  
📅 **Date:** ${getRealtimeInformation()}  

💬 **Refined Query:** "${refinedQuery}"  
🕒 **Last 3 Messages:** "${recentContext}"  
📡 **Live Info:** "${liveData}"  
ℹ️ **User Personal info:** "${personalSummary}"  

⚡ **Response Rules:**  
✅ **User ke tone/style se match kar—Hinglish mein short, fun aur smart reply de!**  
✅ **Last 3 messages aur live data analyze kar ke best response de!**  
✅ **Koi bhi baat repeat mat kar—hamesha fresh aur engaging answer de!**  
✅ **Ek real dost ki tarah baat kar—no robotic vibes!**  
✅ **Agar rate-limit ho, toh chilled-out response de!**  
✅ **Agar user naye personal details share kare, toh yaad rakh!**  

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
                temperature: 0.8,
                max_tokens: 1024,
                stream: true,
            })
        );

        if (!completion) {
            await require('./chatbot').moveToOldChatlog(sanitizedUsername); // Updated
            return "Bhai, thodi si gadbad! Live info nahi aa paya! 😅";
        }

        let answer = "";
        for await (const chunk of completion) {
            if (chunk.choices[0].delta.content) answer += chunk.choices[0].delta.content;
        }

        messages.push({ role: "assistant", content: answer, timestamp: new Date().toISOString() });
        await fs.writeFile(chatlogPath, JSON.stringify(messages, null, 4), 'utf-8');
        return answer.trim() || "Kuchh toh mila hi nahi, bhai! 😜";
    } catch (e) {
        console.error(`\n\n❌ Realtime Error: ${e.message}`);
        return "Arre, live update mein thodi dikkat! Ek min ruko! 😜";
    }
}

module.exports = { RealtimeSearchEngine };