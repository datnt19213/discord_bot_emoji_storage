require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, AttachmentBuilder } = require('discord.js');
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

// Hàm dùng chung để gửi menu Emoji (Ma trận 5x5 - Không chữ)
async function sendEmojiMenu(target, page = 0) {
    try {
        const itemsPerPage = 25; // Ma trận 5x5 = 25
        const result = await cloudinary.api.resources({
            type: 'upload',
            prefix: '',
            max_results: 100
        });

        if (result.resources.length === 0) {
            const content = 'Kho ảnh trống rồi!';
            return target.reply ? target.reply(content) : target.reply({ content, ephemeral: true });
        }

        const currentItems = result.resources.slice(0, 25);
        const guild = target.guild;
        if (!guild) {
            return target.editReply('Lệnh này chỉ dùng được trong Server (Guild) để hiển thị Emoji trên nút.');
        }

        // 1. Đồng bộ Emoji từ Cloudinary sang Discord Server
        const discordEmojis = await guild.emojis.fetch();
        const emojiMapping = [];

        for (const res of currentItems) {
            // Tạo tên emoji hợp lệ (chỉ chữ, số và gạch dưới)
            const cleanName = `hub_${res.public_id.replace(/[^a-zA-Z0-9]/g, '_')}`.slice(0, 32);
            let emoji = discordEmojis.find(e => e.name === cleanName);

            if (!emoji) {
                try {
                    const imageUrl = cloudinary.url(res.public_id, { width: 128, height: 128, crop: "fit" });
                    emoji = await guild.emojis.create({ attachment: imageUrl, name: cleanName });
                    console.log(`✅ Đã tạo Emoji: ${cleanName}`);
                } catch (err) {
                    console.error(`❌ Không thể tạo Emoji ${cleanName}:`, err.message);
                }
            }
            emojiMapping.push({ public_id: res.public_id, emoji: emoji });
        }

        const rows = [];
        // 2. Tạo 5 hàng nút, mỗi hàng 5 nút (Tổng 25 nút có ảnh)
        for (let r = 0; r < 5; r++) {
            const row = new ActionRowBuilder();
            for (let c = 0; c < 5; c++) {
                const index = r * 5 + c;
                if (index < emojiMapping.length) {
                    const item = emojiMapping[index];
                    const button = new ButtonBuilder()
                        .setCustomId(`send_${item.public_id}`)
                        .setStyle(ButtonStyle.Secondary);
                    
                    if (item.emoji) {
                        button.setEmoji(item.emoji.id);
                    } else {
                        button.setLabel('?'); // Backup nếu lỗi emoji
                    }
                    row.addComponents(button);
                } else {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`empty_${index}`)
                            .setLabel(' ')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );
                }
            }
            rows.push(row);
        }

        const menuData = {
            content: '🌟 **KumoD Emoji Hub** (Ảnh đã hiện trên nút!)',
            components: rows
        };

        if (target.deferred || target.replied) {
            await target.editReply(menuData);
        } else if (target.reply) {
            await target.reply(menuData);
        }

    } catch (error) {
        console.error('❌ Lỗi:', error);
        const errorMsg = 'Có lỗi xảy ra khi tạo ma trận ảnh 5x5!';
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
            await interaction.deferReply({ ephemeral: true }); // Thông báo đang xử lý
            await sendEmojiMenu(interaction);
        }
    }

    // 2. Xử lý phân trang
    if (interaction.isButton() && interaction.customId.startsWith('page_')) {
        const newPage = parseInt(interaction.customId.replace('page_', ''));
        await sendEmojiMenu(interaction, newPage);
        return;
    }

    // 3. Xử lý Button bấm gửi Emoji
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('send_')) {
        await interaction.deferUpdate(); // Thông báo đã nhận lệnh bấm nút ngay lập tức
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

            // Không cần deferUpdate ở đây nữa vì đã gọi ở trên
        } catch (err) {
            console.error(err);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);