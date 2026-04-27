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

// Hàm dùng chung để gửi menu Emoji (Ma trận 4x5 + Phân trang)
async function sendEmojiMenu(target, page = 0) {
    try {
        const itemsPerPage = 15; // 3 hàng x 5 nút = 15
        const result = await cloudinary.api.resources({
            type: 'upload',
            prefix: '',
            max_results: 500 // Hỗ trợ lên đến 500 ảnh
        });

        if (result.resources.length === 0) {
            const content = 'Kho ảnh trống rồi!';
            return target.reply ? target.reply(content) : target.reply({ content, ephemeral: true });
        }

        const totalPages = Math.ceil(result.resources.length / itemsPerPage);
        const start = page * itemsPerPage;
        const currentItems = result.resources.slice(start, start + itemsPerPage);

        const guild = target.guild;
        if (!guild) {
            return target.editReply('Lệnh này chỉ dùng được trong Server (Guild).');
        }

        // 1. Đồng bộ Emoji (Xử lý song song)
        const discordEmojis = await guild.emojis.fetch();
        const emojiMapping = await Promise.all(currentItems.map(async (res) => {
            const cleanName = `hub_${res.public_id.replace(/[^a-zA-Z0-9]/g, '_')}`.slice(0, 32);
            let emoji = discordEmojis.find(e => e.name === cleanName);
            if (!emoji) {
                try {
                    const imageUrl = cloudinary.url(res.public_id, { width: 64, height: 64, crop: "fit" });
                    emoji = await guild.emojis.create({ attachment: imageUrl, name: cleanName });
                } catch (err) { console.error(`❌ Lỗi tạo Emoji: ${err.message}`); }
            }
            return { public_id: res.public_id, emoji: emoji };
        }));

        const rows = [];
        // 2. Tạo 3 hàng Emoji (3x5 = 15 nút)
        for (let r = 0; r < 3; r++) {
            const row = new ActionRowBuilder();
            let hasEmoji = false;
            for (let c = 0; c < 5; c++) {
                const index = r * 5 + c;
                if (index < emojiMapping.length) {
                    const item = emojiMapping[index];
                    const button = new ButtonBuilder()
                        .setCustomId(`send_${item.public_id}`)
                        .setStyle(ButtonStyle.Secondary);
                    if (item.emoji) button.setEmoji(item.emoji.id);
                    else button.setLabel('?');
                    row.addComponents(button);
                    hasEmoji = true;
                }
            }
            if (hasEmoji) rows.push(row);
        }

        // 3. Hàng thứ 5 dành cho Điều hướng
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`page_${page - 1}`)
                .setLabel('⬅️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`current_page`)
                .setLabel(`Trang ${page + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`page_${page + 1}`)
                .setLabel('➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page >= totalPages - 1)
        );
        rows.push(navRow);

        const menuData = {
            content: `🌟 **Emoji Hub** - ${result.resources.length} ảnh`,
            components: rows
        };

        if (target.deferred || target.replied) {
            await target.editReply(menuData);
        } else if (target.reply) {
            await target.reply(menuData);
        }

    } catch (error) {
        console.error('❌ Lỗi chi tiết:', error);
        const errorMsg = `Có lỗi xảy ra: ${error.message}. Hãy kiểm tra xem Bot đã có quyền 'Manage Emojis' chưa?`;

        try {
            if (target.deferred || target.replied) {
                await target.editReply({ content: errorMsg, components: [] });
            } else if (target.reply) {
                await target.reply(errorMsg);
            }
        } catch (err) {
            console.error('❌ Không thể gửi báo lỗi:', err.message);
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
        await interaction.deferUpdate(); // Quan trọng: Cập nhật tin nhắn hiện tại thay vì tạo mới
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