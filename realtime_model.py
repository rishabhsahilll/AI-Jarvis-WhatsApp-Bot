import os
import asyncio
import sys
from datetime import datetime, timedelta
from dotenv import load_dotenv
from googlesearch import search
import requests
from bs4 import BeautifulSoup
import json
from groq import Groq

# Set stdout encoding to UTF-8 to handle emojis on Windows
sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()
Assistantname = os.getenv("AI_NAME", "Bro AI")
Developername = os.getenv("Developername", "Rishabh Sahil")

# Groq API Keys setup
GroqAPIKeys = [os.getenv(f"GroqAPIKey{i}") for i in range(1, 7)]
GroqAPIKeys = [key for key in GroqAPIKeys if key]

if not GroqAPIKeys:
    raise ValueError("No valid Groq API keys found in .env")

groq_clients = [Groq(api_key=key) for key in GroqAPIKeys]
current_client_index = 0

def get_realtime_information() -> str:
    now = datetime.now()
    return f"{now.day} {now.strftime('%B')} {now.year}, {now.strftime('%I:%M:%S %p')}"

def get_yesterday_date() -> str:
    yesterday = datetime.now() - timedelta(days=1)
    return f"{yesterday.day} {yesterday.strftime('%B')} {yesterday.year}"

async def fetch_google_search(query: str) -> str:
    try:
        search_results = []
        for url in search(query, num_results=5, lang="en"):
            try:
                response = requests.get(url, timeout=5)
                soup = BeautifulSoup(response.text, 'html.parser')
                title = soup.title.string if soup.title else "No title"
                snippet = soup.find('p').get_text() if soup.find('p') else "No snippet"
                search_results.append(f"- *{title}* ({url}): {snippet}")
            except Exception as e:
                search_results.append(f"Error fetching {url}: {str(e)}")
        return "\n".join(search_results) if search_results else "Kuchh nahi mila, bhai!"
    except Exception as e:
        print(f"Google Search Error: {e}")
        return "Search mein thodi dikkat hai!"

async def fetch_image_link(query: str) -> str:
    try:
        for url in search(f"{query} site:*.edu | site:*.org | site:*.gov -inurl:(signup | login)", num_results=5):
            response = requests.get(url, timeout=5)
            soup = BeautifulSoup(response.text, 'html.parser')
            img = soup.find('img')
            if img and img.get('src'):
                return img['src'] if img['src'].startswith('http') else f"{url}/{img['src']}"
        return "Image nahi mili, bhai!"
    except Exception:
        return "Image fetch mein dikkat hai!"

def ensure_dir(file_path: str):
    directory = os.path.dirname(file_path)
    if not os.path.exists(directory):
        os.makedirs(directory)

async def move_to_old_chatlog(username: str):
    chatlog_path = f"Data/{username}/{username}-ChatLog.json"
    old_chatlog_path = f"Data/{username}/Old/{username}-OldChatLog-{datetime.now().strftime('%Y%m%d%H%M%S')}.json"
    if os.path.exists(chatlog_path):
        ensure_dir(old_chatlog_path)
        with open(chatlog_path, 'r', encoding='utf-8') as f:
            messages = json.load(f)
        with open(old_chatlog_path, 'w', encoding='utf-8') as f:
            json.dump(messages[:-5], f, indent=4)
        with open(chatlog_path, 'w', encoding='utf-8') as f:
            json.dump(messages[-5:], f, indent=4)

async def get_personal_summary(username: str) -> str:
    summary_path = f"Data/{username}/{username}-Summary.txt"
    ensure_dir(summary_path)
    try:
        with open(summary_path, 'r', encoding='utf-8') as f:
            return f.read()
    except:
        return ""

async def update_personal_summary(username: str, new_info: str):
    summary_path = f"Data/{username}/{username}-Summary.txt"
    ensure_dir(summary_path)
    summary = await get_personal_summary(username)
    summary += f"\n{new_info} - {datetime.now().isoformat()}"
    with open(summary_path, 'w', encoding='utf-8') as f:
        f.write(summary)

async def fetch_with_retry(api_call, max_retries_per_key=1, initial_delay=3):
    global current_client_index
    delay = initial_delay
    for i in range(len(groq_clients)):
        client = groq_clients[current_client_index]
        for retry in range(max_retries_per_key):
            try:
                response = api_call(client)
                return response
            except Exception as e:
                print(f"API Error: {e}")
                if "429" in str(e):
                    return {"rateLimited": True, "message": "Ek min ruk, bhai! 😅 Thodi der mein try karta hoon!"}
                if retry < max_retries_per_key - 1:
                    await asyncio.sleep(delay)
                    delay *= 2
        current_client_index = (current_client_index + 1) % len(groq_clients)
    return {"rateLimited": True, "message": "Arre yaar, abhi busy hun! Thodi der baad baat kar! 😅"}

async def refine_query(query: str, messages: list, username: str) -> tuple[str, bool]:
    recent_context = "\n".join([f"{m['role']}: {m['content']}" for m in messages[-2:]]) if len(messages) >= 2 else "No previous context"
    personal_summary = await get_personal_summary(username)
    
    intent_prompt = f"""
    You are an AI search engine figuring out the user's intent.  
    Current Query: "{query}"  
    Last 2 Messages: "{recent_context}"  
    Personal Data: "{personal_summary}"  
    Today: {datetime.now().strftime('%d %B %Y')}  
    Yesterday: {get_yesterday_date()}  

    - Refine the query to be specific and actionable.  
    - Handle "aaj" as today, "kal" as yesterday, and adjust dates accordingly.  
    - For IPL matches, refine to "IPL matches on [date]" or "IPL results on [date]".  
    - For personal queries (e.g., "mera favorite team"), flag it as personal.  
    - Return: "refined_query|is_personal"  
    """
    
    try:
        intent_response = await fetch_with_retry(lambda client: client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[{"role": "system", "content": intent_prompt}],
            temperature=0.5,
            max_tokens=100,
            stream=False
        ))
        
        if isinstance(intent_response, dict) and intent_response.get("rateLimited"):
            return query, False
        
        result = intent_response.choices[0].message.content.strip()
        refined_query, is_personal = result.split("|")
        return refined_query, is_personal.lower() == "true"
    except Exception as e:
        print(f"Query Refinement Error: {e}")
        return query, False

async def extract_personal_info(query: str, messages: list) -> str:
    recent_context = "\n".join([f"{m['role']}: {m['content']}" for m in messages[-2:]]) if len(messages) >= 2 else "No previous context"
    info_prompt = f"""
    Query: "{query}"  
    Last 2 Messages: "{recent_context}"  
    Extract personal info (e.g., "mera favorite team SRH hai" -> "Favorite Team: SRH") or return "None".  
    """
    try:
        info_response = await fetch_with_retry(lambda client: client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[{"role": "system", "content": info_prompt}],
            temperature=0.5,
            max_tokens=50,
            stream=False
        ))
        if isinstance(info_response, dict) and info_response.get("rateLimited"):
            return "None"
        return info_response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Personal Info Extraction Error: {e}")
        return "None"

async def realtime_search_engine(query: str, username: str) -> str:
    sanitized_username = username.replace(" ", "_").strip()
    display_username = sanitized_username.replace("_", " ")
    chatlog_path = f"Data/{sanitized_username}/{sanitized_username}-ChatLog.json"
    
    ensure_dir(chatlog_path)
    try:
        with open(chatlog_path, 'r', encoding='utf-8') as f:
            messages = json.load(f)
    except:
        messages = []
    
    if len(messages) >= 20:
        await move_to_old_chatlog(sanitized_username)
        messages = messages[-5:]
    
    messages.append({"role": "user", "content": query, "timestamp": datetime.now().isoformat()})
    messages = messages[-5:]
    
    # Refine query
    refined_query, is_personal = await refine_query(query, messages, sanitized_username)
    live_data = await fetch_google_search(refined_query) if not is_personal else ""
    personal_summary = await get_personal_summary(sanitized_username) if is_personal else ""
    image_link = await fetch_image_link(refined_query) if "image" in query.lower() else ""
    
    system_prompt = f"""
    You are {Assistantname}, an AI search engine for {display_username or "mera dost"}.  
    📅 **Today:** {get_realtime_information()}  
    📅 **Yesterday:** {get_yesterday_date()}  
    💬 **Original Query:** "{query}"  
    💬 **Refined Query:** "{refined_query}"  
    📡 **Live Data:** "{live_data}"  
    ℹ️ **Personal Data:** "{personal_summary}"  
    🖼️ **Image Link (if relevant):** "{image_link}"  

    ⚡ **Rules:**  
    - Reply in Hinglish, short and fun, WhatsApp style (*bold*, __italic__, etc.).  
    - Use refined query, live data, personal data, or image link to answer accurately.  
    - Handle all queries dynamically (e.g., IPL matches, news, founders, festivals, prices).  
    - For "aaj" = today, "kal" = yesterday, adjust dates smartly.  
    - If personal info is missing (e.g., favorite team), ask user and save it later.  
    - Provide links only when detailed info is needed.  
    - Be robust to spelling errors or varied phrasing.  

    👨‍💻 **Developer Info:**  
    Banaya hai mere dost **Rishabh Kumar**, ek **3 saal ka experienced full-stack developer**.  
    - *Designation*: Full-Stack Developer with 3+ years of experience.  
    - *Skills*: JavaScript, Python, React, Node.js, Django, AI/ML integration.  
    - *Instagram*: https://instagram.com/rishabhsahill  
    - *Facebook*: https://www.facebook.com/rishabhsahill  
    - *X (Twitter)*: https://x.com/rishabhsahill (Photo: https://x.com/rishabhsahill/photo)  
    - *GitHub*: https://github.com/rishabhsahilll  
    - *Anti-social media*: https://netrarsy.pythonanywhere.com  
    - *Rishabh Search Engine (R.S.E)*: https://rishabhsahilll.github.io/rishabh-search-engine  
    - *Portfolio*: https://rishabhsahil.vercel.app  
    - *All Social Media*: https://bento.me/rishabhsahil  
    - *Contact*: https://ig.me/m/rishabhsahill  

    🤔 **Full form only if asked:** "{Assistantname}" = "Bhart Robotic Organizations Artificial Intelligence".  
    🔥 **Follow karna mat bhulna, bhai!** 😎  
    """
    
    try:
        completion = await fetch_with_retry(lambda client: client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": query}],
            temperature=0.8,
            max_tokens=1024,
            stream=False
        ))

        if isinstance(completion, dict) and completion.get("rateLimited"):
            return completion["message"]

        answer = completion.choices[0].message.content.strip()

        # Extract and save personal info
        personal_info = await extract_personal_info(query, messages)
        if personal_info != "None":
            await update_personal_summary(sanitized_username, personal_info)

        messages.append({"role": "assistant", "content": answer, "timestamp": datetime.now().isoformat()})
        with open(chatlog_path, 'w', encoding='utf-8') as f:
            json.dump(messages, f, indent=4)

        return answer or "Kuchh toh mila hi nahi, bhai! 😜"
    except Exception as e:
        print(f"❌ Realtime Error: {str(e)}")
        return "Arre, thodi dikkat ho gayi! Ek min ruko! 😜"

if __name__ == "__main__":
    if len(sys.argv) > 2:
        query, username = sys.argv[1], sys.argv[2]
        result = asyncio.run(realtime_search_engine(query, username))
        print(result)