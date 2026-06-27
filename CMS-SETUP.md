# CMS login setup — GitHub backend (no Netlify Identity)

The CMS at `/admin` is configured to use the **GitHub backend** directly
(`public/admin/config.yml`). Logging in uses "Login with GitHub". This avoids
Netlify Identity and Git Gateway entirely.

It needs a **one-time** setup: a GitHub OAuth App, registered as an OAuth
provider in Netlify. (Claude can't do this part — it involves creating an app
and a client secret.)

## One-time setup

### 1. Create a GitHub OAuth App
GitHub → your avatar → **Settings → Developer settings → OAuth Apps → New OAuth App**:
- **Application name:** `Manati CMS`
- **Homepage URL:** `https://manati-preview.netlify.app`
- **Authorization callback URL:** `https://api.netlify.com/auth/done`
- Click **Register application**.
- Copy the **Client ID**, then **Generate a new client secret** and copy it.

### 2. Add it to Netlify as an OAuth provider
Netlify → (top-right account menu) **Team settings → Sites/OAuth**, or the
project's **Access & security → OAuth → Install provider**:
- Choose **GitHub**.
- Paste the **Client ID** and **Client secret** from step 1.
- Save.

(This lets Netlify's auth endpoint handle the GitHub login that the CMS uses.)

### 3. Commit & push the code change
In GitHub Desktop: commit the changes (config.yml + Base.astro) — summary e.g.
`Switch CMS to GitHub backend` — **Commit to main**, then **Push origin**.
Netlify auto-deploys.

## Using it
Go to **manati-preview.netlify.app/admin** → **Login with GitHub** → authorize →
add/edit Insights articles. Each save commits to the repo and auto-deploys.

> Note: this works because you're a collaborator on the repo. To let other team
> members edit, add them as collaborators on the `manati-site` GitHub repo.
