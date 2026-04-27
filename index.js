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

// Hàm dùng chung để gửi menu Emoji (có phân trang)
async function sendEmojiMenu(target, page = 0) {
    try {
        const itemsPerPage = 5;
        const result = await cloudinary.api.resources({
            type: 'upload',
            prefix: '',
            max_results: 100 // Lấy tối đa 100 ảnh để phân trang
        });

        if (result.resources.length === 0) {
            const content = 'Kho ảnh trống rồi!';
            return target.reply ? target.reply(content) : target.reply({ content, ephemeral: true });
        }

        const totalPages = Math.ceil(result.resources.length / itemsPerPage);
        const start = page * itemsPerPage;
        const end = start + itemsPerPage;
        const currentItems = result.resources.slice(start, end);

        const embeds = [];
        const emojiButtons = new ActionRowBuilder();
        const navButtons = new ActionRowBuilder();

        currentItems.forEach((resource) => {
            const displayName = resource.public_id.includes('/') ? resource.public_id.split('/').pop() : resource.public_id;
            
            // Ép kích thước ảnh nhỏ lại (40x40)
            const imageUrl = cloudinary.url(resource.public_id, { 
                width: 40, 
                height: 40, 
                crop: "fit", 
                quality: "auto" 
            });

            // Tạo Embed với thumbnail (ảnh nhỏ bên cạnh) thay vì image (ảnh to bên dưới)
            embeds.push({
                title: displayName,
                thumbnail: { url: imageUrl }
            });

            // Tạo nút bấm tương ứng
            emojiButtons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`send_${resource.public_id}`)
                    .setLabel(displayName)
                    .setStyle(ButtonStyle.Secondary)
            );
        });

        // Nút điều hướng
        navButtons.addComponents(
            new ButtonBuilder()
                .setCustomId(`page_${page - 1}`)
                .setLabel('⬅️ Trang trước')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`page_${page + 1}`)
                .setLabel('Trang sau ➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page >= totalPages - 1)
        );

        const menuData = {
            content: `🌟 **KumoD Emoji Hub** (Trang ${page + 1}/${totalPages})`,
            embeds: embeds,
            components: [emojiButtons, navButtons]
        };

        if (target.isChatInputCommand && target.isChatInputCommand()) {
            await target.reply({ ...menuData, ephemeral: true });
        } else if (target.isButton && target.isButton()) {
            await target.update(menuData);
        } else if (target.reply) {
            await target.reply(menuData);
        }

    } catch (error) {
        console.error('❌ Lỗi:', error);
        const errorMsg = 'Có lỗi xảy ra khi tải kho ảnh!';
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

    // 2. Xử lý phân trang
    if (interaction.isButton() && interaction.customId.startsWith('page_')) {
        const newPage = parseInt(interaction.customId.replace('page_', ''));
        await sendEmojiMenu(interaction, newPage);
        return;
    }

    // 3. Xử lý Button bấm gửi Emoji
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