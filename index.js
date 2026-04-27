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
            // Lấy tên hiển thị trên nút (phần sau dấu / nếu có)
            const displayName = resource.public_id.includes('/') ? resource.public_id.split('/').pop() : resource.public_id;
            
            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`send_${resource.public_id}`) // Lưu full public_id để lấy URL chính xác
                    .setLabel(displayName)
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

        // Nếu là Slash Command thì gửi ẩn (ephemeral), nếu là tin nhắn thường thì gửi công khai
        if (target.isChatInputCommand && target.isChatInputCommand()) {
            await target.reply({ ...menuData, ephemeral: true });
        } else if (target.reply) {
            await target.reply(menuData);
        }

    } catch (error) {
        console.error('❌ Lỗi Cloudinary/Discord:', error);
        const errorMsg = 'Hệ thống Cloudinary đang gặp sự cố hoặc bạn chưa cấu hình đúng!';
        if (target.replied || target.deferred) {
            await target.followUp({ content: errorMsg, ephemeral: true });
        } else {
            target.reply ? target.reply(errorMsg) : target.reply({ content: errorMsg, ephemeral: true });
        }
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
        const publicId = interaction.customId.replace('send_', '');

        // Tự động lấy URL từ Cloudinary bằng publicId đầy đủ
        const imageUrl = cloudinary.url(publicId, {
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