This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, create a `.env.local` file and add your Groq key:

```bash
GROQ_API_KEY=your_groq_api_key_here
```

Then run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Capacitor iOS Wrapper

To prepare the app for native iOS packaging with Capacitor:

- Install Capacitor dependencies with `npm install`
- Initialize Capacitor: `npx cap init "RegretGPT" com.regretgpt.app --web-dir=out`
- Add the iOS platform: `npm run cap:add:ios`
- Sync the latest web assets: `npm run cap:sync`
- Open Xcode: `npm run cap:open:ios`

> Note: Because this app uses Next.js API routes, you will likely need a hosted backend or a server-backed deployment for a full native build.

## App Store Submission

1. Host your API backend.
   - The native app wrapper can ship the frontend, but `app/api/analyze` calls must reach a live server.
   - Deploy the app or API route to a cloud platform such as Vercel, Netlify, or any Node-compatible host.

2. Build your web assets.
   - Run `npm run build`.
   - Run `npm run cap:sync` to copy the latest output into the iOS project.

3. Open and configure the iOS project.
   - Run `npm run cap:open:ios`.
   - In Xcode, select your team and provisioning profile under `Signing & Capabilities`.
   - Update the app display name, bundle ID, and app icon as needed.

4. Test on a real device.
   - Build and run from Xcode on a physical iPhone or iPad.
   - Verify that network calls to your hosted backend work correctly.

5. Archive and submit.
   - In Xcode, choose `Product > Archive`.
   - Upload the archive to App Store Connect.
   - Complete App Store metadata, screenshots, privacy, and review details.

### Important considerations

- If you want a fully self-contained app without a live server, convert the app to static pages and move analysis to a hosted API endpoint.
- Ensure `manifest.json`, `apple-touch-icon.png`, and app icons are present for proper install and branding.
- Keep credentials and API keys secured on the backend; do not ship them inside the native app.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
