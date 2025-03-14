const { Groq } = require('groq-sdk');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const Assistantname = process.env.Assistantname || "Jarvis";
const { fetchWithRetry, ensureDir, getPersonalSummary } = require('./chatbot');

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
    const chatlogPath = path.join(__dirname, `Data/${username}/${username}-ChatLog.json`);
    // console.log(`\n\nRealtimeSearchEngine called for ${username} with query: ${query}`);
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
    const recentContext = messages.slice(-3).map(m => `${m.role}: ${m.content}`).join("\n");
    const personalSummary = await getPersonalSummary(username);

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
    You are ${Assistantname}, a quick AI dost for ${username.replace("_"," ") || "mera dost"}. Date: ${getRealtimeInformation()}.
    - Refined Query: "${refinedQuery}". Last 3 messages: "${recentContext}". Live info: "${liveData}". Personal info: "${personalSummary}".
    - Respond in Hinglish with emojis based on the refined query and context. Keep it short, fun, and smart!
    - Use live data and personal info to make it better. No repeats!
    - Banaya hai mere dost Rishabh Sahil ne—3 saal ka experience wala full stack developer, Insta: https://instagram.com/rishabhsahill, GitHub: https://github.com/rishabhsahilll, aur uska cool anti-social media: https://netrarsy.pythonanywhere.com 😎, or Rishabh Search Enigne (R.S.E): https://rishabhsahilll.github.io/rishabh-search-engine/, Protfolio: https://portfolio-flask-application.vercel.app/
    `;

    try {
        // console.log(`\n\nRealtime search for: ${query}`);
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
            await require('./chatbot').moveToOldChatlog(username);
            return "Bhai, thodi si gadbad! Live info nahi aa paya! 😅";
        }

        let answer = "";
        for await (const chunk of completion) {
            if (chunk.choices[0].delta.content) answer += chunk.choices[0].delta.content;
        }

        // console.log(`\n\nRealtime response: ${answer}`);
        messages.push({ role: "assistant", content: answer, timestamp: new Date().toISOString() });
        await fs.writeFile(chatlogPath, JSON.stringify(messages, null, 4), 'utf-8');
        return answer.trim() || "Kuchh toh mila hi nahi, bhai! 😜";
    } catch (e) {
        console.error(`\n\n❌ Realtime Error: ${e.message}`);
        return "Arre, live update mein thodi dikkat! Ek min ruko! 😜";
    }
}

module.exports = { RealtimeSearchEngine };