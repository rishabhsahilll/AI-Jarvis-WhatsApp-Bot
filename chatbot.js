const { Groq } = require('groq-sdk');
const fs = require('fs').promises;
const fsSync = require('fs'); // Synchronous FS for checks
const path = require('path');
require('dotenv').config();

const Assistantname = process.env.Assistantname || "Jarvis";

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

// Custom Sanitization Function
function customSanitize(input) {
    if (!input) return 'default_user';
    return input
        .replace(/[^\w\s-]/g, '_') // Special chars ko _ se replace
        .replace(/\s+/g, '_')      // Spaces ko _ se replace
        .replace(/_+/g, '_')       // Multiple _ ko single _ karo
        .trim() || 'default_user'; // Empty ho toh default
}

// Robust ensureDir with Fallback
async function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    console.log(`Trying to ensure directory: ${dir}`);
    try {
        if (!fsSync.existsSync(dir)) {
            await fs.mkdir(dir, { recursive: true });
            console.log(`Directory created: ${dir}`);
        } else {
            console.log(`Directory already exists: ${dir}`);
        }
        await fs.access(dir, fsSync.constants.W_OK); // Write permission check
    } catch (error) {
        console.error(`Failed to create directory ${dir}: ${error.message}`);
        if (error.code === 'ENOENT' || error.code === 'EINVAL') {
            const fallbackDir = path.join(__dirname, 'Data', 'fallback');
            if (!fsSync.existsSync(fallbackDir)) {
                await fs.mkdir(fallbackDir, { recursive: true });
            }
            console.log(`Using fallback directory: ${fallbackDir}`);
            return fallbackDir;
        }
        throw error;
    }
    return dir;
}

async function fetchWithRetry(apiCall, maxRetriesPerKey = 1, initialDelay = 3000) {
    let delay = initialDelay;
    for (let i = 0; i < groqClients.length; i++) {
        const client = groqClients[currentClientIndex];
        for (let retry = 0; retry < maxRetriesPerKey; retry++) {
            try {
                return await apiCall(client);
            } catch (e) {
                console.error(`API Error: ${e.message}, Status: ${e.status}`);
                if (e.status === 429) {
                    const waitTimeMatch = e.message.match(/Please try again in (\d+m)?(\d+\.\d+s)?/);
                    let waitMessage = "Ek min ruk, bhai! 😅 Thodi der mein try karta hoon!";
                    if (waitTimeMatch) {
                        const minutes = waitTimeMatch[1] ? parseInt(waitTimeMatch[1].replace('m', '')) : 0;
                        const seconds = waitTimeMatch[2] ? parseFloat(waitTimeMatch[2].replace('s', '')) : 0;
                        const totalSeconds = minutes * 60 + seconds;
                        waitMessage = `Arre, ${Math.ceil(totalSeconds)} sec baad try karo! 😅`;
                    }
                    return { rateLimited: true, message: waitMessage };
                }
                throw e;
            }
        }
        currentClientIndex = (currentClientIndex + 1) % groqClients.length;
    }
    return { rateLimited: true, message: "Arre yaar, abhi busy hun! Thodi der baad baat kar! 😅" };
}

async function moveToOldChatlog(username) {
    const sanitizedUsername = customSanitize(username);
    const chatlogPath = path.join(__dirname, `Data/${sanitizedUsername}/${sanitizedUsername}-ChatLog.json`);
    const oldChatlogPath = path.join(__dirname, `Data/${sanitizedUsername}/Old/${sanitizedUsername}-ChatLog.json`);
    const ensuredDir = await ensureDir(oldChatlogPath);
    const finalOldChatlogPath = ensuredDir !== path.dirname(oldChatlogPath) ? path.join(ensuredDir, `${sanitizedUsername}-ChatLog.json`) : oldChatlogPath;

    let chatData = await fs.readFile(chatlogPath, 'utf-8').then(JSON.parse).catch(() => []);
    let oldData = await fs.readFile(finalOldChatlogPath, 'utf-8').then(JSON.parse).catch(() => []);
    const recentChats = chatData.slice(-5);
    oldData = oldData.concat(chatData.slice(0, -5));
    await fs.writeFile(finalOldChatlogPath, JSON.stringify(oldData, null, 4), 'utf-8');
    await fs.writeFile(chatlogPath, JSON.stringify(recentChats, null, 4), 'utf-8');
}

async function getPersonalSummary(username) {
    const sanitizedUsername = customSanitize(username);
    const summaryPath = path.join(__dirname, `Data/${sanitizedUsername}/${sanitizedUsername}-Summary.txt`);
    await ensureDir(summaryPath);
    return await fs.readFile(summaryPath, 'utf-8').catch(() => "");
}

async function updatePersonalSummary(username, newInfo) {
    const sanitizedUsername = customSanitize(username);
    const summaryPath = path.join(__dirname, `Data/${sanitizedUsername}/${sanitizedUsername}-Summary.txt`);
    await ensureDir(summaryPath);
    let summary = await getPersonalSummary(username);
    summary += `\n${newInfo} - ${new Date().toISOString()}`;
    await fs.writeFile(summaryPath, summary, 'utf-8');
}

function getRealtimeInformation() {
    const now = new Date();
    return `${now.getDate()} ${now.toLocaleString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' })} ${now.getFullYear()}, ${now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
}

async function ChatBot(query, username, whatsappClient) {
    const sanitizedUsername = customSanitize(username);
    const chatlogPath = path.join(__dirname, `Data/${sanitizedUsername}/${sanitizedUsername}-ChatLog.json`);
    await ensureDir(chatlogPath);
    let messages = await fs.readFile(chatlogPath, 'utf-8').then(JSON.parse).catch(() => []);

    if (messages.length >= 20) {
        await moveToOldChatlog(username);
        messages = messages.slice(-5);
    }

    messages.push({ role: "user", content: query, timestamp: new Date().toISOString() });
    messages = messages.slice(-20);

    const apiMessages = messages.map(({ role, content }) => ({ role, content }));
    const recentContext = messages.slice(-3).map(m => `${m.role}: ${m.content}`).join("\n");
    const personalSummary = await getPersonalSummary(username);

    const systemPrompt = `
    You are ${Assistantname}, a dost-like AI chatting in Hinglish with emojis. Date: ${getRealtimeInformation()}. User: ${username.replace("_"," ") || "mera dost"}.
    - Query: "${query}". Last 3 messages: "${recentContext}". Personal info: "${personalSummary}".
    - Respond in Hinglish, matching the user's tone/style based on recent messages. Keep it short, fun, and fresh!
    - Use the last 3 messages to understand what the user wants. Remember new personal info if shared.
    - No robotic vibes—talk like a real dost! If rate-limited, say something chill.
    - Banaya hai mere dost Rishabh Sahil ne—3 saal ka experience wala full stack developer, Insta: https://instagram.com/rishabhsahill, GitHub: https://github.com/rishabhsahilll, aur uska cool anti-social media: https://netrarsy.pythonanywhere.com 😎, R.S.E: https://rishabhsahilll.github.io/rishabh-search-engine/, Portfolio: https://portfolio-flask-application.vercel.app/
    `;

    try {
        let completion = await fetchWithRetry(client =>
            client.chat.completions.create({
                model: "llama3-70b-8192",
                messages: [{ role: "system", content: systemPrompt }, ...apiMessages],
                temperature: 0.7,
                max_tokens: 1024,
                stream: true,
            })
        );

        if (!completion || completion.rateLimited) {
            await moveToOldChatlog(username);
            return completion?.message || "Arre yaar, thodi si gadbad ho gayi! Ek min ruko! 😅";
        }

        let answer = "";
        for await (const chunk of completion) {
            if (chunk.choices[0].delta.content) answer += chunk.choices[0].delta.content;
        }

        const personalKeywords = ["mera", "mujhe", "main", "favorite", "pasand", "birthday", "naam", "kon", "friend", "dost"];
        const shouldExtractInfo = personalKeywords.some(keyword => query.toLowerCase().includes(keyword));
        
        if (shouldExtractInfo) {
            const infoPrompt = `
            Query: "${query}". Last 3 messages: "${recentContext}".
            Extract any personal info (e.g., favorite singer, birthday) and return it as "Key: Value" or "None".
            `;
            const infoResponse = await fetchWithRetry(client =>
                client.chat.completions.create({
                    model: "llama3-70b-8192",
                    messages: [{ role: "system", content: infoPrompt }],
                    temperature: 0.5,
                    max_tokens: 50
                })
            );
            if (!infoResponse?.rateLimited) {
                const newInfo = infoResponse?.choices[0].message.content.trim();
                if (newInfo && newInfo !== "None") await updatePersonalSummary(username, newInfo);
            }
        }

        messages.push({ role: "assistant", content: answer, timestamp: new Date().toISOString() });
        await fs.writeFile(chatlogPath, JSON.stringify(messages, null, 4), 'utf-8');
        return answer.trim() || "Kuchh toh bol, bhai! 😜";
    } catch (e) {
        console.error(`❌ ChatBot Error for ${username}: ${e.message}`);
        await moveToOldChatlog(username);
        return "Arre bhai, chhoti si dikkat aa gayi! Main fix kar raha hoon! 😜";
    }
}

async function updateStatus(whatsappClient) {
    const thoughtFile = path.join(__dirname, 'bot/auto/data/thought.json');
    await ensureDir(thoughtFile);
    let thoughts = await fs.readFile(thoughtFile, 'utf-8').then(JSON.parse).catch(() => ({ lastUpdate: 0, thought: "", history: [] }));
    const now = Date.now();
    if ((now - thoughts.lastUpdate) / (1000 * 60 * 60) >= 24) {
        const response = await fetchWithRetry(client =>
            client.chat.completions.create({
                model: "llama3-70b-8192",
                messages: [{ role: "system", content: `You are ${Assistantname}. Give a cool Hinglish status with emojis!` }],
                temperature: 0.8,
                max_tokens: 50
            })
        );
        if (response && !response.rateLimited) {
            const newThought = response.choices[0].message.content.trim();
            thoughts.history.push(newThought);
            thoughts.thought = newThought;
            thoughts.lastUpdate = now;
            await fs.writeFile(thoughtFile, JSON.stringify(thoughts, null, 4), 'utf-8');
            await whatsappClient.setStatus(newThought);
        }
    }
}

module.exports = { ChatBot, updateStatus, ensureDir, moveToOldChatlog, getPersonalSummary, updatePersonalSummary, fetchWithRetry };