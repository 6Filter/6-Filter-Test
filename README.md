# 6 Filter Test

NPD screening for CavinKare product and process ideas.
It scores ideas through the 4-filter weightage engine (plus process Phase-1) using the selected LLM.

## Run it in 3 steps

1. Add your API key
   - Rename `.env.local.example` to `.env.local`
   - Paste your key after `VITE_ANTHROPIC_API_KEY=`
     (get one at https://console.anthropic.com)

2. Install dependencies (run this once, inside this folder):

       npm install

3. Start the app:

       npm run dev

   Then open the http://localhost:5173 link it prints.

## Notes
- If the model name errors, open `src/App.jsx`, find the line
  `const MODEL = "claude-sonnet-4-6";` and change it to a model your
  account can access (see https://docs.claude.com).
- The key runs in the browser here, which is fine for local testing only.
  For anything you share or deploy, move the API call to a small backend
  so the key stays private.
