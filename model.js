const { Groq } = require('groq-sdk');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();
const { ensureDir } = require('./chatbot'); // Import ensureDir from chatbot.js

// Custom Sanitization Function (copied from whatsappBot.js for consistency)
function customSanitize(input) {
    if (!input) return 'default_user';
    return input
        .replace(/[^\w\s-]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .trim() || 'default_user';
}

const GroqAPIKeys = [
    process.env.GroqAPIKey1,
    process.env.GroqAPIKey2,
    process.env.GroqAPIKey3,
    process.env.GroqAPIKey4,
    process.env.GroqAPIKey5,
    process.env.GroqAPIKey6,
].filter(key => key);

if (GroqAPIKeys.length === 0) throw new Error("No valid Groq API keys found in .env");

const groqClients = GroqAPIKeys.map(apiKey => new Groq({ apiKey }));
let currentClientIndex = 0;

async function fetchWithRetry(apiCall, maxRetriesPerKey = 3, initialDelay = 3000) {
    let delay = initialDelay;
    for (let i = 0; i < groqClients.length; i++) {
        const client = groqClients[currentClientIndex];
        for (let retry = 0; retry < maxRetriesPerKey; retry++) {
            try {
                return await apiCall(client);
            } catch (e) {
                if (e.status === 429) {
                    console.warn(`Rate limit on key ${currentClientIndex + 1}. Retrying in ${delay / 1000}s...`);
                    await new Promise(res => setTimeout(res, delay));
                    delay *= 2;
                } else {
                    throw e;
                }
            }
        }
        currentClientIndex = (currentClientIndex + 1) % groqClients.length;
        delay = initialDelay;
    }
    return null;
}

function getRealtimeInformation() {
    const now = new Date();
    return `${now.getDate()} ${now.toLocaleString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' })} ${now.getFullYear()}, ${now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
}

async function FirstLayerDMM(query, username) {
    const sanitizedUsername = customSanitize(username); // Sanitize username
    const chatlogPath = path.join(__dirname, `Data/${sanitizedUsername}/${sanitizedUsername}-ChatLog.json`);
    await ensureDir(chatlogPath); // Ensure directory exists
    let messages;
    try {
        messages = await fs.readFile(chatlogPath, 'utf-8').then(JSON.parse);
    } catch (e) {
        if (e.code === 'ENOENT') {
            // If file doesn't exist, create it with an empty array
            await fs.writeFile(chatlogPath, JSON.stringify([], null, 4), 'utf-8');
            messages = [];
        } else {
            messages = [];
        }
    }
    const recentContext = messages.slice(-5).map(m => `${m.role}: ${m.content}`).join("\n");

    const systemPrompt = `
    You are a smart AI classifying queries into categories. Date: ${getRealtimeInformation()}.
    - Query: "${query}". Last 3 messages: "${recentContext}".
    - Categories: start, general, realtime, play, reminder, lyrics, end.
    - Analyze the query and context smartly:
      - "start" for greetings (e.g., "hello", "hi", "Hey" ,"hey", "heyyyyy", "hellllooooo", "hiii", "namaste", "hlo", "good morning", "good afternoon", "good evening", "happy holi", "happy birthday", "happy diwali", "hpy holi", "hpy birthday", "hpy diwali" {bas or koi words mat lena jitna hai itna hi lena}) or if no prior convo exists and user initiates and ignore ("ha", "ho", "haa", "hm", "hmm", "hn", "han", etc).
      - "general" for casual chats or unclear intent.
      - "realtime" for time-sensitive/factual queries (e.g., "Holi kab hai","news", "{sports like ipl, football, etc}", "latest information", "google kar", "search on google", "pahle google kar ke dekh") or image requests (e.g., "cat ka image do", "modi ka image do", "elon musk ka image do", "dog ka image do", "rishabhsahil ka image do", "developer ka image do").
      - "play" for music/song requests (e.g., "gana bajao", "song play karo", "music sunao").
      - "reminder" for setting reminders.
      - "lyrics" for lyrics requests (e.g., "is song ka lyric likho", "lyrics do", "gaane ke bol").
      - "end" for stopping the convo (e.g., "bye", "stop", "good night", "sone jaa rhe hai") or if no prior convo exists and user initiates.
    - Return ONLY the category followed by the query (e.g., "start Hello").
    - No explanations, just the result!
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
        const result = response?.choices[0].message.content.trim() || `general ${query}`;

        const musicKeywords = ["gana", "bajao", "sunao", "music", "song", "track", "play"];
        const lyricsKeywords = ["lyric", "lyrics", "bol", "text"];
        if (result.startsWith("play") && !musicKeywords.some(word => query.toLowerCase().includes(word))) {
            return [`play ${query}`];
        }
        if (result.startsWith("lyrics") && !lyricsKeywords.some(word => query.toLowerCase().includes(word))) {
            return [`lyrics ${query}`];
        }

        return [result];
    } catch (e) {
        console.error(`❌ FirstLayerDMM Error: ${e.message}`);
        return [`general ${query}`];
    }
}

module.exports = { FirstLayerDMM };