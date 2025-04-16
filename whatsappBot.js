const { execSync } = require('child_process');
const qrcode = require('qrcode-terminal');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();
const axios = require('axios');
const { FirstLayerDMM } = require('./model');
const { ChatBot, updateStatus, ensureDir } = require('./chatbot');
const { RealtimeSearchEngine } = require('./realtimeSearchEngine');
const { playMusicRecommendation } = require('./play');
const { MessageMedia } = require('whatsapp-web.js');
const { fetchLyrics } = require('./lyrics');

// Detect if running on mobile
const isMobile = process.platform === 'android' || process.platform === 'ios';

// Define startup greetings list
const startupGreetings = [
    // Basic greetings
    "hi", "hii", "hiii", "hiiii", "hiiiii", "hiiiiii", "hiiiiiii",
    "hello", "hallo", "helo", "helloo", "heloo", "hlo", "hllo",
    "hey", "heyy", "heyyy", "heyyyy", "heya", "heyya", "heyyo",
    "yo", "yoo", "yooo", "yoy", "yoyo",

    // Morning greetings
    "good morning", "goodmorning", "gm", "gdm", "gud morning",
    "gudmorning", "good mornin", "gud mornin", "morning", "mornin",
    "gd morning", "gd mornin", "mng", "morn", "gud mng",

    // Afternoon greetings
    "good afternoon", "goodafternoon", "ga", "gud afternoon",
    "gudafternoon", "good aftrnoon", "gud aftrnoon", "afternoon",
    "gd afternoon", "gd aftrnoon", "aftn", "gud aftn",

    // Evening greetings
    "good evening", "goodevening", "ge", "gud evening",
    "gudevening", "good evning", "gud evning", "evening", "evning",
    "gd evening", "gd evning", "evng", "gud evng",

    // Wake-up greetings
    "wake up", "wakeup", "wake", "wakey", "waky", "wakee",
    "utho", "uth", "utth", "uthoo", "uthja", "uthjaa",
    "jagoo", "jago", "jag", "jaggo", "jagja", "jagjaa",
    "get up", "getup", "gettup", "get upp", "gup",

    // Casual/Other
    "jarvis", ".", "sup", "wassup", "whatsup", "whatssup", "whsup",
    "hola", "holla", "heya", "hiya", "hy", "hie",
    "namaste", "namste", "nmste", "namskar", "namaskar",
    "salut", "sala", "salu", "salo",
    "oi", "oii", "oy", "oye", "oyee",
    "holaa", "hellow", "hiiiiiiiii", "heyyyyy",
    "helo", "heelo", "helllo", "helloo", "heloo", "heelo", "heello"
].map(g => g.toLowerCase()); // Case-insensitive matching

// Custom Sanitization Function
function customSanitize(input) {
    if (!input) return 'default_user';
    return input
        .replace(/[^\w\s-]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .trim() || 'default_user';
}

const folderPath = path.join(__dirname, 'Blocked User');
const filePath = path.join(folderPath, 'blockedlist.txt');

async function loadBlockedUsers() {
    try {
        // Ensure folder and file exist
        await fs.mkdir(folderPath, { recursive: true });
        try {
            await fs.access(filePath);
        } catch (err) {
            await fs.writeFile(filePath, '', 'utf-8');
        }

        // Read file and return Set of blocked users
        const data = await fs.readFile(filePath, 'utf-8');
        const blockedSet = new Set(
            data.split(',') // Use comma separator
                .map(name => name.trim().toLowerCase())
                .filter(name => name.length > 0)
        );
        return blockedSet;
    } catch (err) {
        console.error("❌ Error handling blocked list:", err);
        return new Set();
    }
}

async function updateBlockedUser(username, shouldBlock, username1) {
    const user = username.trim().toLowerCase();

    try {
        // Ensure folder and file exist
        await fs.mkdir(folderPath, { recursive: true });
        try {
            await fs.access(filePath);
        } catch (err) {
            await fs.writeFile(filePath, '', 'utf-8');
        }

        // Load current blocked users
        const data = await fs.readFile(filePath, 'utf-8');
        const blockedSet = new Set(
            data.split(',')
                .map(name => name.trim().toLowerCase())
                .filter(name => name.length > 0)
        );

        // Perform block or unblock action
        if (shouldBlock) {
            if (blockedSet.has(user)) {
                return `You are already on the block list.`;
            } else {
                blockedSet.add(user);
                await fs.writeFile(filePath, [...blockedSet].join(', '), 'utf-8');
                return `You have been blocked.`;
            }
        } else {
            if (blockedSet.has(user)) {
                blockedSet.delete(user);
                await fs.writeFile(filePath, [...blockedSet].join(', '), 'utf-8');
                return `You have been unblocked.`;
            } else {
                return `You are not on the block list.`;
            }
        }
    } catch (err) {
        console.error("❌ Error updating blocked list:", err);
        return `❌ Something went wrong while updating block status.`;
    }
}

// Modified dependency checker
async function ensureDependencies() {
    const commonDeps = ['whatsapp-web.js', 'qrcode-terminal', '@google/generative-ai', 'sanitize-filename', 'axios'];
    const laptopDeps = ['gtts', 'nircmd', 'screenshot-desktop', 'sound-play'];
    const dependencies = isMobile ? commonDeps : [...commonDeps, ...laptopDeps];

    const missing = dependencies.filter(dep => {
        try {
            require(dep);
            return false;
        } catch (e) {
            return e.code === 'MODULE_NOT_FOUND';
        }
    });
    if (missing.length > 0) execSync(`npm install ${missing.join(' ')}`, { stdio: 'inherit' });
}

// Mobile-specific SystemControl
const SystemControl = isMobile ?
    class MobileSystemControl {
        constructor(client) {
            this.client = client;
        }
        async notAvailable(feature) {
            return `Sorry dost, ${feature} phone pe available nahi hai! 😅 Laptop pe try karo!`;
        }
        getSystemInfo = () => this.notAvailable("System Info");
        speak = (text) => this.notAvailable("Speak");
        adjustVolume = () => this.notAvailable("Volume Control");
        getCurrentVolume = () => this.notAvailable("Volume Check");
        executeCommand = () => this.notAvailable("Command Execution");
        takeScreenshot = () => this.notAvailable("Screenshot");
        executeShortcut = () => this.notAvailable("Keyboard Shortcuts");
        startBatteryMonitor = () => Promise.resolve();
        stopBatteryMonitor = () => Promise.resolve();
    }
    : require('./system-control');

(async () => {
    await ensureDependencies();
    const { Client, LocalAuth } = require('whatsapp-web.js');
    const { GoogleGenerativeAI } = require('@google/generative-ai');

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: 'jarvis-bot' }),
        webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' },
        puppeteer: { args: ['--no-sandbox'], headless: true }
    });

    const gemini = new GoogleGenerativeAI(process.env.GeminiAPIKey);
    let ownerNumber;
    const Assistantname = process.env.Assistantname || "BRO A.I";
    const systemControl = new SystemControl(client);

    async function getUserSetup(username) {
        const sanitizedUsername = customSanitize(username);
        const setupPath = path.join(__dirname, `Data/${sanitizedUsername}/messages-start-stop/${sanitizedUsername}-setup.json`);
        await ensureDir(setupPath);
        return await fs.readFile(setupPath, 'utf-8').then(JSON.parse).catch(() => ({ state: "stop" }));
    }

    async function updateUserSetup(username, state) {
        const sanitizedUsername = customSanitize(username);
        const setupPath = path.join(__dirname, `Data/${sanitizedUsername}/messages-start-stop/${sanitizedUsername}-setup.json`);
        await ensureDir(setupPath);
        await fs.writeFile(setupPath, JSON.stringify({ state }, null, 4), 'utf-8');
    }

    async function adjustLength(text, customUsername = Assistantname) {
        const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
        let adjusted = `${text} 🌟 ~ ${customUsername}`;
        if (adjusted.length >= 10 && adjusted.length <= 100) return adjusted;
        if (adjusted.length > 100) {
            const prompt = `Shorten this to 50-80 chars, keep it friendly and meaningful in Hinglish, preserve case: "${text}"`;
            const result = await model.generateContent(prompt);
            return `${result.response.text().trim()} 🌟 ~ ${customUsername}`;
        }
        return adjusted.padEnd(10, " ");
    }

    async function generateThought(query = null, username = Assistantname, author = null) {
        const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
        let thought = `Technolog is my Life ~ ${username}`;

        const correctSpelling = async (input) => {
            const prompt = `Correct this author name if misspelled, preserve case, return only the corrected name: "${input}"`;
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        };

        try {
            if (author) {
                const correctedAuthor = await correctSpelling(author);
                const isGita = correctedAuthor.toLowerCase().includes("bhagavad gita");
                if (isGita) {
                    const prompt = "Ek dost jaisa Hinglish quote de Bhagavad Gita se inspire hoke, 10-100 chars";
                    const result = await model.generateContent(prompt);
                    thought = await adjustLength(result.response.text().trim(), username);
                } else {
                    const prompt = `Ek dost jaisa Hinglish quote de ${correctedAuthor} se inspire hoke, 10-100 chars`;
                    const result = await model.generateContent(prompt);
                    thought = await adjustLength(result.response.text().trim(), username);
                }
            } else if (query) {
                const prompt = `Ek dost jaisa Hinglish quote de "${query}" pe based, 10-100 chars`;
                const result = await model.generateContent(prompt);
                thought = await adjustLength(result.response.text().trim(), username);
            } else {
                const prompt = "Ek dost jaisa random Hinglish quote de, 10-100 chars";
                const result = await model.generateContent(prompt);
                thought = await adjustLength(result.response.text().trim(), username);
            }
        } catch (error) {
            console.error(`Error generating quote: ${error.message}`);
            thought = await adjustLength("Dil se Soch, Dost!", username);
        }
        return thought;
    }

    async function updateThought(query = null, myThought = null, username = Assistantname, forceUpdate = false, author = null) {
        const thoughtFile = path.join(__dirname, 'bot/auto/data/thought.json');
        await ensureDir(thoughtFile);
        let thoughts = await fs.readFile(thoughtFile, 'utf-8').then(JSON.parse).catch(() => ({ lastUpdate: 0, thought: "", addedBy: "", history: [] }));
        const now = Date.now();

        const shouldUpdate = forceUpdate || !thoughts.lastUpdate || (now - thoughts.lastUpdate) >= 24 * 60 * 60 * 1000;
        if (!shouldUpdate) return thoughts.thought;

        let newThought;
        if (myThought) {
            newThought = await adjustLength(myThought, username);
        } else if (author) {
            newThought = await generateThought(null, username, author);
        } else {
            newThought = await generateThought(query, username);
        }

        thoughts.thought = newThought;
        thoughts.addedBy = username;
        thoughts.lastUpdate = now;
        thoughts.history.push({ thought: newThought, addedBy: username, timestamp: now, query: query || author || "default" });
        await fs.writeFile(thoughtFile, JSON.stringify(thoughts, null, 4), 'utf-8');
        await client.setStatus(newThought);
        return newThought;
    }

    async function showHelp(username, isSystemHelp = false) {
        if (isSystemHelp) {
            if (isMobile) {
                return `
🎉 *System Help Center, ${username}!* 🎉
Main ${Assistantname} hoon, lekin phone pe system commands limited hain!

1️⃣ **@0527 thought <options>** – Status update karo (e.g., "@0527 thought myquery: Somthing")  
2️⃣ **@0527 feedback <text>** – Feedback do (e.g., "@0527 feedback: Cool bot!")  
3️⃣ **@0527 help** – Yeh menu dekho!  
*Note:* Baaki features laptop pe available hain!
                `.trim();
            }
            return `
🎉 *System Help Center, ${username}!* 🎉
Main ${Assistantname} hoon, yahan system control ke liye!

1️⃣ **@0527 system info** – CPU, RAM, Battery info dekho!  
2️⃣ **@0527 speak: <text>** – System bolega (e.g., "@0527 speak: नमस्ते dost")  
3️⃣ **@0527 volume up <percent>** – Volume badhao (e.g., "@0527 volume up 50%")  
4️⃣ **@0527 volume** – Current volume check karo!  
5️⃣ **@0527 thought <options>** – Status update karo (e.g., "@0527 thought myquery: Somthing")  
6️⃣ **@0527 cmd <command>** – Laptop control (e.g., "@0527 cmd copy F:\\file.txt G:\\")  
7️⃣ **@0527 ss** – Screenshot le aur bhejo!  
8️⃣ **@0527 key: <shortcut>** – Shortcut chalao (e.g., "@0527 key: ctrl+c")  
9️⃣ **@0527 sendme: <path>** – File bhejo (e.g., "@0527 sendme: D:\\pic.jpg")  
10️⃣ **@0527 feedback <text>** – Feedback do (e.g., "@0527 feedback: Cool bot!")  
11️⃣ **@0527 help** – Yeh menu dekho!  
            `.trim();
        }
        return `
🎉 *Welcome to Help Center, ${username}!* 🎉
Main ${Assistantname} hoon, aur main yahan madad ke liye hoon! 😊 Default mein band hoon, shuru karne ke liye "." ya "hello" bhejo!

1️⃣ **Chat Karein** – Koi bhi sawaal puchhein ya "." bhejo!  
   - *Jaise:* "Hello", "Kya haal hai?"  
2️⃣ **Image Assist** – Image bhejo + "/analyze" ya "/image <query>"!  
   - *Example:* "/analyze" ya "/image caption likho"  
3️⃣ **Live Info** – "Holi kab hai?" jaise sawaal puchho! ⏰  
4️⃣ **Music Zone** – "Gana bajao" likho, song milega! 🎵  
5️⃣ **Start/End** – "." ya "hello" se start, "bye" se end!  
👉 System commands ke liye: *help*  
        `.trim();
    }

    async function saveMedia(username, message) {
        if (!message.hasMedia) return null;
        try {
            const media = await message.downloadMedia();
            if (!media || !media.mimetype) return null;

            const sanitizedUsername = customSanitize(username);
            let mediaType;
            switch (message.type) {
                case 'image': mediaType = 'photo'; break;
                case 'video': mediaType = 'video'; break;
                case 'audio': mediaType = 'audio'; break;
                case 'document': mediaType = 'document'; break;
                default: mediaType = 'other'; break;
            }

            const chat = await message.getChat();
            const isStatus = chat.isStatus || message.isStatus;
            const basePath = isStatus
                ? path.join(__dirname, `Data/${sanitizedUsername}/status/${mediaType}`)
                : path.join(__dirname, `Data/${sanitizedUsername}/media/${mediaType}`);

            const ensuredDir = await ensureDir(path.join(basePath, 'dummy'));
            const finalBasePath = ensuredDir !== path.dirname(path.join(basePath, 'dummy')) ? ensuredDir : basePath;

            const now = new Date();
            const fileExt = media.mimetype.split('/')[1] || 'bin';
            const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${Date.now()}.${fileExt}`;
            const filePath = path.join(finalBasePath, fileName);

            await fs.writeFile(filePath, Buffer.from(media.data, 'base64'));
            return filePath;
        } catch (error) {
            console.error(`Media save error for ${username}: ${error.message}`);
            return null;
        }
    }

    async function analyzeImage(filePath, query = "Is image ko Hinglish mein detail mein describe kar, jaise dost karega!") {
        const ext = path.extname(filePath).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return `Ye toh image nahi hai (${ext})!`;
        const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
        const imageData = await fs.readFile(filePath);
        try {
            const result = await model.generateContent([
                `${query}, dost jaisa bol!`,
                { inlineData: { data: imageData.toString('base64'), mimeType: 'image/jpeg' } }
            ]);
            return result.response.text();
        } catch (error) {
            if (error.message.includes("PROHIBITED_CONTENT")) {
                const stats = await fs.stat(filePath);
                const sizeKB = (stats.size / 1024).toFixed(2);
                return `Arre yaar, yeh image thodi tricky hai! 😅 Size ${sizeKB} KB, ${ext} file. Kya jaanna hai?`;
            }
            console.error(`Image analysis error: ${error.message}`);
            return "Image analyze mein gadbad ho gayi, dost!";
        }
    }

    async function saveFeedback(username, feedbackText) {
        const sanitizedUsername = customSanitize(username);
        const feedbackDir = path.join(__dirname, 'bot/feedback');
        const feedbackFile = path.join(feedbackDir, `${sanitizedUsername}.json`);
        await ensureDir(feedbackFile);

        let feedbackData = await fs.readFile(feedbackFile, 'utf-8').then(JSON.parse).catch(() => []);
        feedbackData.push({
            username,
            timestamp: new Date().toISOString(),
            feedback: feedbackText
        });
        await fs.writeFile(feedbackFile, JSON.stringify(feedbackData, null, 4), 'utf-8');
        return `Feedback save ho gaya, ${username}! Tera input: "${feedbackText}"`;
    }

    const getUsername = (contact) => contact.name || contact.number || 'dost';

    // Background running function
    async function keepAlive() {
        if (isMobile) {
            console.log("Running in background mode on mobile...");
            process.on('SIGTERM', async () => {
                console.log('Bot stopped');
                await client.destroy();
                process.exit(0);
            });
            setInterval(() => {
                console.log('Bot is alive:', new Date().toISOString());
            }, 60000); // Ping every minute
        }
    }

    client.on('qr', qr => {
        qrcode.generate(qr, { small: true });
        if (isMobile) console.log('Scan this QR code from your phone WhatsApp!');
    });

    client.on('ready', async () => {
        ownerNumber = client.info.wid._serialized;
        systemControl.ownerNumber = ownerNumber;

        const onMessage = `Hey ${process.env.Developername}, I am ${Assistantname}, --> ON`;
        try {
            await client.sendMessage(ownerNumber, onMessage);
            console.log(`✅ Sent ON message to ${ownerNumber}: ${onMessage}`);
        } catch (error) {
            console.error(`❌ Error sending ON message: ${error.message}`);
        }

        // Set initial online presence
        await client.sendPresenceAvailable();
        // console.log('✅ Bot set to online status');

        // Periodically update presence to stay online
        const presenceInterval = setInterval(async () => {
            try {
                await client.sendPresenceAvailable();
                console.log('✅ Refreshed online status');
            } catch (error) {
                console.error('❌ Error refreshing presence:', error.message);
            }
        }, 30000); // Update every 30 seconds

        await updateThought(null, null, Assistantname);
        if (!isMobile) systemControl.startBatteryMonitor();
        await keepAlive();

        // Clear interval on disconnect
        client.on('disconnected', () => {
            clearInterval(presenceInterval);
        });
    });



    client.on('message', async (message) => {
        try {
            const chat = await message.getChat();
            const contact = await message.getContact();
            const username = getUsername(contact);
            let query = message.body.trim();
            const queryLower = query.toLowerCase();
            const isGroup = chat.id._serialized.endsWith('@g.us');
            // const cisGroup = chat.id._serialized.endsWith('@c.us');
            const mentioned = message.mentionedIds?.length ? message.mentionedIds.join(', ') : 'None';
            const ownerNumber = client.info.wid._serialized;

            if (!query && !message.hasMedia) return;
            if (isGroup && !message.mentionedIds.includes(client.info.wid._serialized)) return;

            async function typingstart() {
                // Start typing effect after 2 seconds
                await new Promise(resolve => setTimeout(resolve, 2000));
                await chat.sendSeen();
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Generate random total delay (5-12 seconds for natural typing)
                const totalDelaySeconds = 5 + Math.floor(Math.random() * 8); // Random between 5-12 seconds
                const totalDelayMs = totalDelaySeconds * 1000;
                // console.log(`Typing Effect Delay: ${totalDelaySeconds}s`);

                // Randomly choose 1 or 2 pauses (50% chance for each)
                const numPauses = Math.random() < 0.5 ? 1 : 2;
                // Calculate pause positions (e.g., at 40% and 80% of total delay for 2 pauses)
                const pausePositions = numPauses === 1
                    ? [totalDelayMs * 0.5] // Single pause at midpoint
                    : [totalDelayMs * 0.4, totalDelayMs * 0.8]; // Two pauses at 40% and 80%

                const startTime = Date.now();
                for (let i = 0; i < pausePositions.length; i++) {
                    const position = pausePositions[i];
                    // Wait until the pause position
                    const elapsed = Date.now() - startTime;
                    if (elapsed < position) {
                        await chat.sendStateTyping();
                        await new Promise(resolve => setTimeout(resolve, position - elapsed));
                    }

                    // Pause typing for exactly 1 second
                    await chat.clearState();
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1-second pause

                    // Resume typing for 0.5-1 second
                    await chat.sendStateTyping();
                    const typingDuration = 500 + Math.random() * 500; // 0.5-1s
                    await new Promise(resolve => setTimeout(resolve, typingDuration));
                }

                // Wait until total delay is complete
                const elapsed = Date.now() - startTime;
                if (elapsed < totalDelayMs) {
                    await chat.sendStateTyping();
                    await new Promise(resolve => setTimeout(resolve, totalDelayMs - elapsed));
                }
                // Clear typing state before processing
                await chat.clearState();
            }


            const mediaPath = await saveMedia(username, message);
            const sanitizedUsername = customSanitize(username);
            const chatlogPath = path.join(__dirname, `Data/${sanitizedUsername}/${sanitizedUsername}-ChatLog.json`);
            await ensureDir(chatlogPath);
            let messages = await fs.readFile(chatlogPath, 'utf-8').then(JSON.parse).catch(() => []);

            const userSetup = await getUserSetup(username);
            let isStarted = userSetup.state === "start";

            // Handle startup logic
            if (!isStarted) {
                const words = queryLower.split(/\s+/);
                const firstWord = words[0];
                const hasGreeting = startupGreetings.includes(firstWord);
                const isSingleGreeting = words.length === 1 && hasGreeting;
                const hasGreetingWithText = hasGreeting && words.length > 1;

                if (isSingleGreeting || hasGreetingWithText) {
                    await updateUserSetup(username, "start");
                    await typingstart()
                    const reply = await ChatBot(query, username, client);
                    await chat.clearState(); // Stop typing effect
                    await message.reply(reply);
                    return;
                }
                await chat.clearState(); // Stop typing effect
                return;
            }

            // Handle image commands
            if (mediaPath && message.type === 'image') {
                const isImageCommand = ['/image', '\\image', '/analyze', '\\analyze'].includes(query.split(' ')[0].toLowerCase());
                if (isImageCommand) {
                    let imageQuery = query.split(' ').slice(1).join(' ').trim() ||
                        (query.toLowerCase().startsWith('/analyze') || query.toLowerCase().startsWith('\\analyze')
                            ? "Is image ko Hinglish mein detail mein describe kar, jaise dost ko samjha raha ho!"
                            : "Is image ko Hinglish mein describe kar aur Instagram ke liye caption aur viral tags suggest kar!");
                    const mediaAnalysis = await analyzeImage(mediaPath, imageQuery);
                    messages.push({ role: "user", content: `${query}`, timestamp: new Date().toISOString() });
                    messages.push({ role: "assistant", content: mediaAnalysis, timestamp: new Date().toISOString() });
                    messages = messages.slice(-20);
                    await typingstart()
                    await fs.writeFile(chatlogPath, JSON.stringify(messages, null, 4), 'utf-8');
                    await chat.clearState(); // Stop typing effect
                    await message.reply(mediaAnalysis);
                    return;
                }
                if (mediaPath) {
                    await chat.clearState(); // Stop typing effect
                    return;
                }
            }

            if (mediaPath) {
                await chat.clearState(); // Stop typing effect
                return;
            }

            if (query.toLowerCase() === "help") {
                await typingstart()
                const helpResponse = await showHelp(username);
                await chat.clearState(); // Stop typing effect
                await message.reply(helpResponse);
                return;
            }

            // Handle @0527 commands
            if (query.toLowerCase().startsWith('@0527')) {
                const command = query.slice(5).trim();
                let response;

                if (command.toLowerCase() === 'system info') {
                    response = isMobile ?
                        await systemControl.getSystemInfo() :
                        `System Info:\n- CPU: ${systemControl.getSystemInfo().cpu}\n- RAM: ${systemControl.getSystemInfo().ram}\n- Battery: ${await systemControl.getSystemInfo().battery}%`;
                } else if (command.toLowerCase().startsWith('speak:')) {
                    const text = command.slice(6).trim();
                    response = isMobile ?
                        await systemControl.speak(text) :
                        `Main bol diya: "${text}"`;
                    if (!isMobile) await systemControl.speak(text);
                } else if (command.toLowerCase().startsWith('volume up')) {
                    const match = command.match(/volume up (\d+)%/i);
                    if (match) {
                        const percentage = parseInt(match[1]);
                        if (percentage >= 0 && percentage <= 100) {
                            if (isMobile) {
                                response = await systemControl.adjustVolume();
                            } else {
                                systemControl.adjustVolume(percentage);
                                const currentVolume = systemControl.getCurrentVolume();
                                response = `Volume ${percentage}% pe set kar diya! Abhi volume: ${currentVolume}%`;
                            }
                        } else {
                            response = 'Volume 0-100% ke beech mein do, dost!';
                        }
                    } else {
                        response = 'Format galat hai! Jaise: "@0527 volume up 50%"';
                    }
                } else if (command.toLowerCase() === 'volume') {
                    response = isMobile ?
                        await systemControl.getCurrentVolume() :
                        `Abhi volume: ${systemControl.getCurrentVolume()}%`;
                } else if (command.toLowerCase().startsWith('thought')) {
                    const thoughtQuery = command.slice(7).trim();
                    if (thoughtQuery === "") {
                        response = await updateThought(null, null, username, true);
                    } else if (thoughtQuery.toLowerCase().startsWith("myquery:")) {
                        const myThoughtMatch = thoughtQuery.match(/myquery:\s*([^,]+)(?:,\s*name:\s*(\w+))?/i);
                        if (myThoughtMatch) {
                            const myThought = myThoughtMatch[1].trim();
                            const thoughtUsername = myThoughtMatch[2] || username;
                            response = await updateThought(null, myThought, thoughtUsername, true);
                        }
                    } else if (thoughtQuery.toLowerCase().startsWith("query:")) {
                        const queryMatch = thoughtQuery.match(/query:\s*([^,]+)(?:,\s*name:\s*(\w+))?/i);
                        if (queryMatch) {
                            const queryText = queryMatch[1].trim();
                            const thoughtUsername = queryMatch[2] || username;
                            response = await updateThought(queryText, null, thoughtUsername, true);
                        }
                    } else if (thoughtQuery.toLowerCase().startsWith("author:")) {
                        const authorMatch = thoughtQuery.match(/author:\s*([^,]+)(?:,\s*name:\s*(\w+))?/i);
                        if (authorMatch) {
                            const author = authorMatch[1].trim();
                            const thoughtUsername = authorMatch[2] || username;
                            response = await updateThought(null, null, thoughtUsername, true, author);
                        }
                    } else if (thoughtQuery.toLowerCase().startsWith("name:")) {
                        const nameMatch = thoughtQuery.match(/name:\s*(\w+)/i);
                        if (nameMatch) {
                            const thoughtUsername = nameMatch[1];
                            response = await updateThought(null, null, thoughtUsername, true);
                        }
                    }
                } else if (command.toLowerCase().startsWith('cmd')) {
                    const cmd = command.slice(3).trim();
                    if (cmd) {
                        const output = isMobile ?
                            await systemControl.executeCommand() :
                            systemControl.executeCommand(cmd);
                        response = isMobile ? output : `Command chal gaya: "${cmd}"\nOutput: ${output}`;
                        if (!isMobile) {
                            const ssPath = await systemControl.takeScreenshot();
                            const media = MessageMedia.fromFilePath(ssPath);
                            await client.sendMessage(message.from, media, { caption: `Confirm karo, sahi hua?` });
                        }
                    } else {
                        response = 'Koi command toh do! Jaise: "@0527 cmd dir"';
                    }
                } else if (command.toLowerCase() === 'ss') {
                    if (isMobile) {
                        response = await systemControl.takeScreenshot();
                    } else {
                        const ssPath = await systemControl.takeScreenshot();
                        const media = MessageMedia.fromFilePath(ssPath);
                        await client.sendMessage(message.from, media, { caption: `Yeh lo screenshot!` });
                        response = '';
                    }
                } else if (command.toLowerCase().startsWith('key:')) {
                    const shortcut = command.slice(4).trim();
                    response = isMobile ?
                        await systemControl.executeShortcut() :
                        `Shortcut chal gaya: "${shortcut}"`;
                    if (!isMobile) {
                        systemControl.executeShortcut(shortcut);
                        const ssPath = await systemControl.takeScreenshot();
                        const media = MessageMedia.fromFilePath(ssPath);
                        await client.sendMessage(message.from, media, { caption: `Confirm karo, sahi hua?` });
                    }
                } else if (command.toLowerCase().startsWith('sendme:')) {
                    const filePath = command.slice(7).trim();
                    if (await fs.access(filePath).then(() => true).catch(() => false)) {
                        const media = MessageMedia.fromFilePath(filePath);
                        await client.sendMessage(message.from, media, { caption: `Yeh lo file: ${filePath}` });
                        response = '';
                    } else {
                        response = `File nahi mili: "${filePath}"`;
                    }
                } else if (command.toLowerCase().startsWith('feedback')) {
                    const feedbackText = command.slice(8).trim();
                    if (feedbackText) {
                        response = await saveFeedback(username, feedbackText);
                    } else {
                        response = "Feedback mein kuchh likhna toh banta hai, dost! 😅";
                    }
                } else if (command.toLowerCase() === 'help') {
                    response = await showHelp(username, true);
                }

                if (response) {
                    await typingstart()
                    await chat.clearState(); // Stop typing effect
                    await message.reply(response);
                }
                return;
            }

            // Handle volume up command
            if (query.toLowerCase().startsWith('volume up')) {
                const match = query.match(/volume up (\d+)%/i);
                if (match) {
                    const percentage = parseInt(match[1]);
                    let response;
                    if (percentage >= 0 && percentage <= 100) {
                        if (isMobile) {
                            response = await systemControl.adjustVolume();
                        } else {
                            systemControl.adjustVolume(percentage);
                            const currentVolume = systemControl.getCurrentVolume();
                            response = `Volume ${percentage}% pe set kar diya! Abhi volume: ${currentVolume}%`;
                        }
                    } else {
                        response = 'Volume 0-100% ke beech mein do, dost!';
                    }
                    await typingstart()
                    await chat.clearState(); // Stop typing effect
                    await message.reply(response);
                } else {
                    await typingstart()
                    await chat.clearState(); // Stop typing effect
                    await message.reply('Format galat hai! Jaise: "volume up 50%"');
                }
                return;
            }

            // Process tasks
            const decisions = await FirstLayerDMM(query, username);
            let response = '';
            let taskProcessed = false;

            const processTasks = async (decisions, query, username, client) => {
                for (const task of decisions) {
                    const match = task.match(/^(start|general|realtime|play|end|lyrics)\s+(.+)$/);
                    if (!match) {
                        return await ChatBot(query, username, client);
                    }

                    const category = match[1];
                    const q = query;

                    switch (category) {
                        case 'start':
                            return await ChatBot(q, username, client);
                        case 'end':
                            await updateUserSetup(username, "stop");
                            return await ChatBot(q, username, client);
                        case 'general':
                            return await ChatBot(q, username, client);
                        case 'realtime':
                            return await RealtimeSearchEngine(q, username, client);
                        case 'play':
                            return await playMusicRecommendation(q, username, client);
                        case 'lyrics':
                            return await fetchLyrics(q, username, client);
                        default:
                            return await ChatBot(q, username, client);
                    }
                }
            };

            let userBlocked_list = await loadBlockedUsers();
            const _time = Math.floor(Date.now() / 1000);
            // console.log(_time)
            // console.log(message.timestamp)
            const timeDifference = _time - message.timestamp;
            if (timeDifference <= 120) {
                if (isGroup) {
                    if (mentioned == ownerNumber) {
                        const filtered_ownerNumber = `@${ownerNumber.replace("@c.us", "").replace("@g.us", "")}`;
                        const filtered_query = query.replace(filtered_ownerNumber, "");
                        response = await processTasks(decisions, filtered_query, username, client);
                        await typingstart()
                        taskProcessed = true;
                        await chat.clearState(); // Stop typing effect
                        await message.reply(response);
                    } else {
                        console.log("Not Group Mentioned")
                    }
                } else if (query.toLowerCase() == "@ai block") {
                    const reply = await updateBlockedUser(message.from.replace('@c.us', '').replace('@g.us', ''), true, customSanitize(username).replace("_", ""));
                    await typingstart()
                    await chat.clearState(); // Stop typing effect
                    await client.sendMessage(message.from, reply);

                } else if (query.toLowerCase() == "@ai unblock") {
                    const reply = await updateBlockedUser(message.from.replace('@c.us', '').replace('@g.us', ''), false, customSanitize(username).replace("_", ""));
                    await typingstart()
                    await chat.clearState(); // Stop typing effect
                    await client.sendMessage(message.from, reply);

                } else if (userBlocked_list.has(message.from.replace('@c.us', '').replace('@g.us', ''))) {
                    console.log(username);
                } else {
                    response = await processTasks(decisions, query, username, client);
                    await typingstart()
                    taskProcessed = true;
                    await chat.clearState(); // Stop typing effect
                    await message.reply(response);
                }
            } else {
                console.log("Old Messages Not Replay")
            }
        } catch (e) {
            console.error(`❌ Message Error: ${e.message}`);
            // await client.sendMessage(message.from, `Arre yaar, ye "${e.message}" error aagya hai! Main fix karta hoon! 😅`);
        }
    });

    client.on('disconnected', async (reason) => {
        console.error(`❌ Disconnected: ${reason}`);
        if (!isMobile) systemControl.stopBatteryMonitor();
        await client.destroy();
        setTimeout(() => client.initialize(), 5000);
    });

    await client.initialize();
    if (isMobile) process.stdin.resume(); // Keeps process running on mobile
})();