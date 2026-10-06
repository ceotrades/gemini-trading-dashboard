# GEMINI

A trading dashboard I built for myself and use before the session opens.

## The problem

Everything I needed before the market opened lived in a different place. News in one tab, the economic calendar in another, my own trade notes in a file. Assembling it took about forty minutes every morning and I kept skipping it.

## What it does

One screen with the news, the economic calendar and a trade journal in it. It calls the Claude API to do the reading and summarising rather than leaving me to scan headlines myself.

It installs to the phone home screen as a PWA and opens like an app.

## Result

Morning prep went from about forty minutes to ten. Everything relevant is on one screen when I open it, so there is nothing to assemble.

## Stack

React from a CDN, pinned with integrity hashes. Claude API for the analysis, called through a Cloudflare Worker that keeps the key off the page. PWA manifest for the install. Hosted on Netlify.

The app source is `src/app.jsx`. `node build.mjs` compiles it once into plain JavaScript inside `index.html` and writes `_headers` with a matching Content-Security-Policy. Netlify serves the result as a static file, so there's no build on deploy and no compiler in the browser.

## The worker

`cloudflare-worker.js` proxies four routes: the Claude API, the ForexFactory calendar, Yahoo Finance prices and Yahoo Finance headlines. It only answers the dashboard's own origin. On the Claude route it pins the model to Haiku 4.5, caps the output at 2,000 tokens and rejects oversized requests, so a stranger who finds the URL can't run up the bill.

## Status

Personal tool. I open it every morning before the session.
