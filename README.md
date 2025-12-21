# Imaginate

Imaginate(imaginate.run) is a vibe coding web app. It allows users to chat with

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

## Screenshots

### Settings Page

This view allows you to set API keys for providers so that you can select that providers
models when writing prompts.
![Chat Page](screenshots/settings.png)

### Landing Page(Tic-tac-toe question)

You can also select the model\ you'd like to use based on if you have set an
api key for that provider in `settings`.
![Chat Page](screenshots/landing_page.png)

### Chat Page App View(Tic-tac-toe app)

This view has the ability to answer prompts in "Ask" mode or "Code" mode. You can also select the model
you'd like to use based on if you have set an api key for that provider in `settings`.
![Chat Page App](screenshots/app_view.png)

### Chat Page Code View(Tic-tac-toe app)

This view has the ability to answer prompts in "Ask" mode or "Code" mode. You can also select the model
you'd like to use based on if you have set an api key for that provider in `settings`.
![Chat Page Code](screenshots/code_view.png)

### Technology Used

This application uses OpenAI models for agent logic, E2B for sandboxes to run code in,
Inngest to make long running task async, and clerk for authentication and payments.
The webapp is made with Next.js and Shadcn primarily.
