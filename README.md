# StudyFlow AI Assistant

Small Flask + frontend example that sends user messages to an LLM via the OpenAI Python SDK.

## Setup (Windows)

1. Open terminal and create a venv:

```powershell
cd "g:/Shared drives/_Per 2 Web 1/Kanu, A/Project_001/Python"
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

2. Add your OpenAI API key (temporary for current session):

```powershell
$env:OPENAI_API_KEY = "sk-..."
python app.py
```

Or set it permanently with `setx OPENAI_API_KEY "sk-..."`.

3. Open http://localhost:5000/assistant.html in your browser.

## Notes
- `app.py` uses the OpenAI Moderation endpoint before forwarding user messages to the model.
- Adjust `model` and system prompt in `app.py` to change behavior and safety.
- This is a minimal example for development; don't expose a plain API key in production.
