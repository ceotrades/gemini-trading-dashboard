# GEMINI

A trading dashboard I built for myself and use before the session opens.

## The problem

Everything I needed before the market opened lived in a different place. News in one tab, the economic calendar in another, my own trade notes in a file. Assembling it took about forty minutes every morning and I kept skipping it.

## What it does

One screen with the news, the economic calendar and a trade journal in it. It calls the Claude API to do the reading and summarising rather than leaving me to scan headlines myself.

It installs to the phone home screen as a PWA, so it opens like an app rather than a bookmark.

## Result

Morning prep went from about forty minutes to ten. Everything relevant is on one screen when I open it, so there is nothing to assemble.

## Stack

React, loaded straight from a CDN with no build step. One HTML file. Claude API for the analysis. PWA manifest for the install. Deployed on Vercel with no build command.

The whole thing is a single file on purpose. No framework, no bundler, nothing to maintain.

## Status

Personal tool, in use. Not a product and not intended as one.
