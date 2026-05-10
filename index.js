require('dotenv').config();

const { Client } = require('discord.js-selfbot-v13');
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🌱 GaG Event Bot is alive!');
});

app.listen(port, () => {
    console.log(`🌐 Server running on port ${port}`);
});

const client = new Client();

const ROLE_IDS = {
    "Mythical Bee Egg": "1502942674364399626",
    "Honey Hive Pack": "1502942841603756164",
    "Hive Egg": "1502942925942816822",
    "Professor Bee": "1502942989390053426",
    "Honey Birds Of Paradise": "1502943064141070517"
};

let isChecking = false;

let lastEggMessageId = null;
let lastEventMessageId = null;

function parseStockText(text) {

    const items = [];
    const lines = text.split('\n');

    for (const line of lines) {

        const cleaned = line
            .replace(/[•]/g, '')
            .trim();

        const match = cleaned.match(/^(.+?) x(\d+)$/i);

        if (!match) continue;

        items.push({
            raw: match[1].trim(),
            count: parseInt(match[2])
        });
    }

    return items;
}

async function fetchEmbed(channelId, keyword) {

    const channel = client.channels.cache.get(channelId);

    if (!channel) {
        console.log(`❌ Канал не найден: ${channelId}`);
        return null;
    }

    const messages = await channel.messages.fetch({ limit: 5 });

    const msg = messages.find(m =>
        m.embeds?.length > 0 &&
        m.embeds[0].title?.includes(keyword)
    );

    if (!msg) {
        console.log(`⚠️ Embed не найден: ${keyword}`);
        return null;
    }

    const embed = msg.embeds[0];

    const text =
        embed.description ||
        embed.fields?.map(f => f.value).join('\n') ||
        '';

    return {
        items: parseStockText(text),
        messageId: msg.id
    };
}

function getPingText(items) {

    const pings = [];

    for (const item of items) {

        const cleanName = item.raw
            .replace(/[^\p{L}\p{N}\s]/gu, '')
            .trim();

        if (ROLE_IDS[cleanName]) {
            pings.push(`<@&${ROLE_IDS[cleanName]}>`);
        }
    }

    return [...new Set(pings)].join(' ');
}

function renderItems(items) {

    return items
        .map(i => `${i.raw} — ${i.count}`)
        .join('\n');
}

async function sendEggEmbed(eggs) {

    const embed = {
        title: "🌱 GROW A GARDEN | EVENT EGGS",
        color: 0xffcc00,
        description: renderItems(eggs),
        footer: {
            text: `Last update: ${new Date().toLocaleTimeString('en-GB')} UTC`
        },
        timestamp: new Date().toISOString()
    };

    const pingText = getPingText(eggs);

    await axios.post(process.env.WEBHOOK_URL, {
        content: pingText || null,
        embeds: [embed]
    });

    console.log("🥚 EVENT EGGS отправлен");
                     }

async function sendEventEmbed(events) {

    const embed = {
        title: "🌱 GROW A GARDEN | EVENT ITEMS",
        color: 0xff8800,
        description: renderItems(events),
        footer: {
            text: `Last update: ${new Date().toLocaleTimeString('en-GB')} UTC`
        },
        timestamp: new Date().toISOString()
    };

    const pingText = getPingText(events);

    await axios.post(process.env.WEBHOOK_URL, {
        content: pingText || null,
        embeds: [embed]
    });

    console.log("📦 EVENT ITEMS отправлен");
}

async function sendCombinedEmbed(eggs, items) {

    const embed = {
        title: "🌱 GROW A GARDEN | EVENT STOCK",
        color: 0xff9900,
        fields: [
            {
                name: "Bee Eggs",
                value: renderItems(eggs),
                inline: false
            },
            {
                name: "Event Items",
                value: renderItems(items),
                inline: false
            }
        ],
        footer: {
            text: `Last update: ${new Date().toLocaleTimeString('en-GB')} UTC`
        },
        timestamp: new Date().toISOString()
    };

    const pingText = getPingText([
        ...eggs,
        ...items
    ]);

    await axios.post(process.env.WEBHOOK_URL, {
        content: pingText || null,
        embeds: [embed]
    });

    console.log("📦 COMBINED EVENT STOCK отправлен");
}

async function checkAllStocks() {

    if (isChecking) return;
    isChecking = true;

    try {

        console.log("🔄 Проверка event stock...");

        const eggsData = await fetchEmbed(
            process.env.EGGS_CHANNEL_ID,
            'Event Eggs Stock'
        );

        const eventsData = await fetchEmbed(
            process.env.EVENTS_CHANNEL_ID,
            'Events Stock'
        );

        if (!eggsData) {
            console.log("⏳ Нет eggsData");
            return;
        }

        const eggs = eggsData.items;
        const events = eventsData?.items || [];

        const now = new Date();
        const minute = now.getUTCMinutes();

        const eggsUpdated =
            eggsData.messageId !== lastEggMessageId;

        const eventsUpdated =
            eventsData &&
            eventsData.messageId !== lastEventMessageId;

        // 🧠 COMBINED LOGIC
        const shouldCombine =
            (minute === 0 || minute === 30) &&
            eggsUpdated &&
            eventsUpdated;

        // 📦 COMBINED EMBED
        if (shouldCombine) {

            lastEggMessageId = eggsData.messageId;
            lastEventMessageId = eventsData.messageId;

            await sendCombinedEmbed(
                eggs,
                events
            );

            return;
        }

        // 🥚 ONLY EGGS
        if (eggsUpdated && !eventsUpdated) {

            lastEggMessageId = eggsData.messageId;

            await sendEggEmbed(eggs);
        }

        // 📦 ONLY EVENTS
        if (eventsUpdated && !eggsUpdated) {

            lastEventMessageId = eventsData.messageId;

            await sendEventEmbed(events);
        }

    } catch (err) {

        console.error("❌ Ошибка:", err.message);

    } finally {

        isChecking = false;
    }
}

function startSmartScheduler() {

    const scheduleNext = () => {

        const now = new Date();
        const seconds = now.getSeconds();

        let targetSecond;

        if (seconds < 20) targetSecond = 20;
        else if (seconds < 50) targetSecond = 50;
        else targetSecond = 80;

        const delay =
            (targetSecond - seconds) * 1000;

        console.log(`⏱️ Следующая проверка через ${delay / 1000}s`);

        setTimeout(async () => {

            await checkAllStocks();
            scheduleNext();

        }, delay);
    };

    scheduleNext();
}

client.on('ready', async () => {

    console.log(`✅ Залогинен как ${client.user.tag}`);

    console.log("🧠 Smart scheduler запущен");

    startSmartScheduler();
});

client.login(process.env.USER_TOKEN)
    .then(() => console.log("📲 login() успешно"))
    .catch(err => console.error("❌ LOGIN ERROR:", err));
