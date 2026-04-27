require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cloudinary = require('cloudinary').v2;

// 1. Cấu hình Cloudinary (Lấy từ Dashboard Cloudinary của bạn)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Khởi tạo Discord Bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Khi Bot sẵn sàng
client.once('ready', () => {
    console.log(`✅ Đã đăng nhập thành công: ${client.user.tag}`);
});

// Lệnh mở kho Emoji: Người dùng gõ !emo
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!emo') {
        try {
            // Lấy danh sách ảnh từ folder 'discord_emojis' trên Cloudinary
            const result = await cloudinary.api.resources({
                type: 'upload',
                prefix: 'discord_emojis/',
                max_results: 25 // Discord giới hạn tối đa 25 nút bấm mỗi tin nhắn
            });

            if (result.resources.length === 0) {
                return message.reply('Kho ảnh trống rồi, hãy upload ảnh lên Cloudinary folder "discord_emojis" nhé!');
            }

            const rows = [];
            let currentRow = new ActionRowBuilder();

            result.resources.forEach((resource, index) => {
                const emojiName = resource.public_id.split('/')[1]; // Lấy tên file

                currentRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`send_${emojiName}`)
                        .setLabel(emojiName)
                        .setStyle(ButtonStyle.Secondary)
                );

                // Mobile Friendly: Cứ mỗi 5 nút mình ngắt 1 hàng cho dễ bấm trên điện thoại
                if ((index + 1) % 5 === 0 || index === result.resources.length - 1) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
            });

            await message.reply({
                content: '🌟 **KumoD Emoji Hub**\nBấm nút để gửi sticker (không cần Nitro):',
                components: rows
            });

        } catch (error) {
            console.error(error);
            message.reply('Hệ thống Cloudinary đang gặp sự cố!');
        }
    }
});

// Xử lý sự kiện bấm nút (Interaction) - Quan trọng cho PC/Web/Mobile
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('send_')) {
        const name = interaction.customId.replace('send_', '');

        // Tối ưu ảnh WebP cực nhẹ để Mobile/4G load nhanh
        const imageUrl = cloudinary.url(`discord_emojis/${name}`, {
            width: 320,
            crop: "scale",
            format: "webp",
            quality: "auto"
        });

        try {
            // Tìm Webhook hiện có hoặc tạo mới trong channel
            const webhooks = await interaction.channel.fetchWebhooks();
            let webhook = webhooks.find(wh => wh.name === 'EmojiHelper');

            if (!webhook) {
                webhook = await interaction.channel.createWebhook({
                    name: 'EmojiHelper',
                    avatar: client.user.displayAvatarURL(),
                });
            }

            // "Giả danh" người vừa bấm nút để gửi ảnh
            await webhook.send({
                content: imageUrl,
                username: interaction.member.displayName,
                avatarURL: interaction.user.displayAvatarURL(),
            });

            // Để tránh lỗi "Interaction failed" trên Discord
            await interaction.deferUpdate();

        } catch (err) {
            console.error('Lỗi Webhook:', err);
            await interaction.reply({ content: 'Lỗi gửi ảnh rồi!', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);