const { Groq } = require('groq-sdk');
require('dotenv').config();

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
    const chatlogPath = require('path').join(__dirname, `Data/${username}/${username}-ChatLog.json`);
    let messages = await require('fs').promises.readFile(chatlogPath, 'utf-8').then(JSON.parse).catch(() => []);
    const recentContext = messages.slice(-5).map(m => `${m.role}: ${m.content}`).join("\n");

    const systemPrompt = `
    You are a smart AI classifying queries into categories. Date: ${getRealtimeInformation()}.
    - Query: "${query}". Last 3 messages: "${recentContext}".
    - Categories: start, general, realtime, play, reminder, end.
    - Analyze the query and context smartly:
      - "start" for greetings (e.g., "hello", "hi", "Hey" ,"hey", "heyyyyy", "Hellllooooo", "namaste", "hlo", "good morning", "good afternoon" ,"good evening") or if no prior convo exists and user initiates.
      - "general" for casual chats or unclear intent.
      - "realtime" for time-sensitive or factual queries (e.g., "Holi kab hai").
      - "play" for music/song requests (e.g., "gana bajao", "song play karo", "music sunao").
      - "reminder" for setting reminders.
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
        if (result.startsWith("play") && !musicKeywords.some(word => query.toLowerCase().includes(word))) {
            return [`general ${query}`];
        }

        // console.log(`AI Decision: ${result}`);
        return [result];
    } catch (e) {
        console.error(`❌ FirstLayerDMM Error: ${e.message}`);
        // console.log(`AI Decision (Fallback): general ${query}`);
        return [`general ${query}`];
    }
}

module.exports = { FirstLayerDMM };