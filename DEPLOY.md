# Deploying the Manati site (free)

Two routes. Start with Route 1 to get a shareable link fast; move to Route 2
for the permanent, auto-updating setup with the `/admin` content editor.

---

## Route 1 — Netlify Drop (fastest, ~2 minutes, no Git)

A live, fully interactive URL to send to the team. No account-linking, no CLI.

1. Build the site. In Terminal, from the project folder:

   ```
   npm run build
   ```

   This creates a `dist/` folder inside the project.

2. Go to **https://app.netlify.com/drop** and sign up for the free plan
   (Google sign-in works).

3. In Finder, open the project folder and **drag the `dist` folder onto the
   Netlify Drop page.**

4. You get a live URL instantly (e.g. `something.netlify.app`). Share it.
   Under **Site settings → Change site name** you can rename it.

To update later: run `npm run build` again and drag the new `dist` folder over.

> Note: Route 1 does not include the `/admin` content editor — that needs the
> Git-connected setup in Route 2.

---

## Route 2 — GitHub + Cloudflare Pages or Netlify (permanent, auto-deploy + CMS)

Do this once past team review. Every change you push rebuilds the site
automatically, and the `/admin` editor works.

1. Create a free GitHub account and a new repository, then push this project to
   it (GitHub Desktop is the no-CLI option: github.com/apps/desktop).

2. **Cloudflare Pages:** dash.cloudflare.com → Workers & Pages → Create →
   Pages → Connect to Git → pick the repo. Set:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Output directory:** `dist`

   **Netlify alternative:** app.netlify.com → Add new site → Import from Git →
   pick the repo (build command `npm run build`, publish directory `dist`).

3. **Custom domain:** in the host's domain settings, add `manati.co.za` and
   follow the DNS instructions. (DNS changes are done in your domain registrar —
   I can guide, but you'll make the changes.)

4. **Enable the `/admin` content editor (Netlify):**
   - Site configuration → Identity → Enable Identity.
   - Identity → Services → Git Gateway → Enable.
   - Invite yourself/team as Identity users.
   - The CMS at `yoursite/admin` will then let the team add/edit articles in the
     browser; changes commit to Git and the site rebuilds automatically.

---

## Things only you can do

Account creation, signing in, authorising the host to access your repo,
accepting terms, and changing DNS at your registrar all require you to log in.
Share what each screen shows and I'll tell you exactly what to click.
