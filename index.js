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

        const currentItems = result.resources.slice(0, 25); // Lấy 25 ảnh đầu tiên cho ma trận 5x5

        // 1. Tạo URL ảnh lưới 5x5 bằng Cloudinary Overlays
        // Sử dụng ảnh đầu tiên làm base và dùng layer 'blank' hoặc hiệu ứng để làm nền trắng
        const overlays = currentItems.map((res, i) => {
            const x = (i % 5) * 30;
            const y = Math.floor(i / 5) * 30;
            // Cloudinary yêu cầu escape dấu / thành : trong overlay
            const cleanId = res.public_id.replace(/\//g, ':');
            return `l_${cleanId},w_30,h_30,g_north_west,x_${x},y_${y}`;
        }).join('/');

        // Tạo URL thủ công để kiểm soát chính xác các layer
        const cloudName = process.env.CLOUDINARY_NAME;
        const gridUrl = `https://res.cloudinary.com/${cloudName}/image/upload/w_150,h_150,c_pad,b_white/${overlays}/${currentItems[0].public_id}`;

        const attachment = new AttachmentBuilder(gridUrl, { name: 'matrix.png' });
        const rows = [];

        // 2. Tạo đúng 5 hàng, mỗi hàng 5 nút (Tổng 25 nút)
        for (let r = 0; r < 5; r++) {
            const row = new ActionRowBuilder();
            for (let c = 0; c < 5; c++) {
                const index = r * 5 + c;
                if (index < currentItems.length) {
                    const res = currentItems[index];
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`send_${res.public_id}`)
                            .setEmoji('⬛') // Nút vuông tối giản
                            .setStyle(ButtonStyle.Secondary)
                    );
                } else {
                    // Nút ảo nếu không đủ ảnh
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`empty_${index}`)
                            .setEmoji('🔳')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );
                }
            }
            rows.push(row);
        }

        const menuData = {
            content: '🌟 **Emoji Matrix 5x5**',
            files: [attachment],
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