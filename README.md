# Discord Bot Emoji Hub

A Discord bot that allows users to send stickers/emojis from a Cloudinary storage without needing Discord Nitro.

## Features
- Fetch images from Cloudinary `discord_emojis/` folder.
- Display an interactive menu with buttons for each emoji.
- Send emojis via Webhooks to "impersonate" the user.
- Optimized for mobile with WebP format and button layout.

## Prerequisites
- Node.js (v16.x or higher)
- Discord Bot Token
- Cloudinary Account

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd discord-bot-emoji
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Create a `.env` file in the root directory and add your credentials:
   ```env
   DISCORD_TOKEN=your_discord_token
   CLOUDINARY_NAME=your_cloudinary_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   ```

## Usage
1. Upload your images to a folder named `discord_emojis` in your Cloudinary account.
2. Run the bot:
   ```bash
   node index.js
   ```
3. In Discord, you can use:
   - **Slash Command**: Type `/emo` to open the emoji hub.
   - **Prefix Command**: Type `!emo` to open the emoji hub.
4. Click a button to send the corresponding emoji.

## Technical Details
- **discord.js**: Used for interacting with the Discord API.
- **cloudinary**: Used for image storage and delivery optimization.
- **Webhooks**: Used to send messages with user's name and avatar.
