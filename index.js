require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes } = require('discord.js');
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
client.once('ready', async () => {
    console.log(`✅ Đã đăng nhập thành công: ${client.user.tag}`);

    // Đăng ký Slash Command /emo
    const commands = [
        {
            name: 'emo',
            description: 'Mở kho Emoji Hub',
        },
    ];

    try {
        console.log('⏳ Đang làm mới Slash Commands...');
        await client.application.commands.set(commands);
        console.log('✅ Đã đăng ký Slash Commands thành công!');
    } catch (error) {
        console.error('❌ Lỗi khi đăng ký Slash Commands:', error);
    }
});

// Giữ lại Prefix command nếu người dùng vẫn muốn dùng !emo (Tùy chọn)
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.content === '!emo') {
        await sendEmojiMenu(message);
    }
});

// Hàm dùng chung để gửi menu Emoji
async function sendEmojiMenu(target) {
    try {
        const result = await cloudinary.api.resources({
            type: 'upload',
            prefix: '',
            max_results: 25
        });

        if (result.resources.length === 0) {
            const content = 'Kho ảnh trống rồi, hãy upload ảnh lên Cloudinary folder "discord_emojis" nhé!';
            return target.reply ? target.reply(content) : target.reply({ content, ephemeral: true });
        }

        const rows = [];
        let currentRow = new ActionRowBuilder();

        result.resources.forEach((resource, index) => {
            const emojiName = resource.public_id.split('/')[1];
            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`send_${emojiName}`)
                    .setLabel(emojiName)
                    .setStyle(ButtonStyle.Secondary)
            );

            if ((index + 1) % 5 === 0 || index === result.resources.length - 1) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
        });

        const menuData = {
            content: '🌟 **KumoD Emoji Hub**\nBấm nút để gửi sticker (không cần Nitro):',
            components: rows
        };

        if (target.reply) {
            await target.reply(menuData);
        } else {
            await target.reply({ ...menuData, ephemeral: true });
        }

    } catch (error) {
        console.error(error);
        const errorMsg = 'Hệ thống Cloudinary đang gặp sự cố!';
        target.reply ? target.reply(errorMsg) : target.reply({ content: errorMsg, ephemeral: true });
    }
}

// Xử lý sự kiện Interaction (Slash Command và Button)
client.on('interactionCreate', async (interaction) => {
    // 1. Xử lý Slash Command /emo
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'emo') {
            await sendEmojiMenu(interaction);
        }
    }

    // 2. Xử lý Button bấm gửi Emoji
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('send_')) {
        const name = interaction.customId.replace('send_', '');

        // Tự động lấy URL từ Cloudinary
        // .url() sẽ trả về link ảnh gốc. 
        // Nếu bạn muốn ép kiểu hoặc tối ưu, hãy dùng cách dưới đây:
        const imageUrl = cloudinary.url(`discord_emojis/${name}`, {
            // Nếu là GIF, Cloudinary sẽ tự giữ nguyên nếu bạn không ép format tĩnh
            // Để an toàn cho cả động và tĩnh, bạn nên bỏ dòng format: "webp" 
            // hoặc dùng "auto" để Cloudinary tự quyết định.
            quality: "auto",
            fetch_format: "auto"
        });

        try {
            const webhooks = await interaction.channel.fetchWebhooks();
            let webhook = webhooks.find(wh => wh.name === 'EmojiHelper');
            if (!webhook) {
                webhook = await interaction.channel.createWebhook({ name: 'EmojiHelper' });
            }

            await webhook.send({
                content: imageUrl, // Discord sẽ tự render link này thành ảnh hoặc GIF
                username: interaction.member.displayName,
                avatarURL: interaction.user.displayAvatarURL(),
            });

            await interaction.deferUpdate();
        } catch (err) {
            console.error(err);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);