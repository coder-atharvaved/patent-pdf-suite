# Patent + PDF Suite

## One-time setup

1. Install Python 3.10+ and Node.js 20+ LTS.
2. In this folder, run `npm install` once.

## Start the application

Double-click `start-all.bat`. It starts the Flask backend in one terminal and the React app in another. Then open `http://127.0.0.1:5173` in Chrome or Edge.

Alternatively, double-click `start-backend.bat` and then `start-react.bat` in separate windows.

During local development, Vite proxies `/api` calls to the Flask backend at `http://127.0.0.1:5000`. The green backend indicator confirms it is ready.

The backend automatically creates `uploaded_excel` and `downloaded_pdfs` beside the project files when needed; no personal Windows paths are required.

## Excel input

For PDF downloads, upload an `.xlsx`, `.xls`, or `.csv` whose first sheet includes a `Url` column. An optional `Action Date` column is used to name PDFs as `YYYY-MM-DD.pdf`, so files sort by date inside the one folder selected by the user. Rows without a valid date use their Excel row number.

## Client notes

- Use Chrome or Edge to choose an exact destination folder.
- Keep the backend terminal open while using the PDF download tab.
- The PDF URLs must be reachable from the computer running the app.

## Production deployment

The repository includes a `Dockerfile` that builds the React app and serves it together with the Flask API as one web service. This avoids a public localhost URL and makes the app deployable to any Docker-capable provider.

### Render

1. Push this folder to a GitHub repository.
2. In Render, select **New → Blueprint** and select that repository. Render detects `render.yaml`.
3. Deploy. Open the generated HTTPS URL and share it with users.

No frontend API URL is needed for this single-service deployment: the frontend calls `/api/*` on the same domain. If you intentionally host frontend and backend separately, set `VITE_API_URL` at frontend build time and set backend `ALLOWED_ORIGINS` to the exact frontend URL.

The deployed backend rejects private-network targets, follows only a few validated redirects, accepts PDFs up to 30 MB by default, and does not store uploaded files. Add authentication and provider-level rate limiting before making the service broadly public.
