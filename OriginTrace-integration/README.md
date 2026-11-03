# OriginTrace integration

The `origintrace-web/` folder is the **separate OriginTrace codebase supplied by LeahSoda**, preserved with one small integration change in `frontend/src/main.js`.

`ContextLens` opens a new tab to the configured OriginTrace URL and adds three query parameters:

- `from=contextlens`
- `url=https://www.instagram.com/reel/...`
- `caption=...`

The added code pre-fills the URL and caption in the OriginTrace investigation form, **without automatically starting research or scraping/downloading anything**. Click **Analyze** in OriginTrace to start its own analysis workflow. Existing OriginTrace dependencies, credits, and server setup remain its own responsibility.

For local development:

```sh
cd origintrace-web
npm ci
cp .env.example .env
# Add keys to origintrace-web/.env, NOT to the extension.
npm run dev
```

The default URL in ContextLens Settings is `http://localhost:5173/`. A deployed HTTPS OriginTrace URL is also supported. The collaborator's existing frontend has NOT been deployed by this bundle.

Credits and ownership: OriginTrace is the collaborator's supplied source. ContextLens is a distinct extension and companion service. Neither project's name nor authorship should be overwritten when submitting.
