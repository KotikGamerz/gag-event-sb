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
    "Transcendent Bee Egg": "1508173406837674076",
    "Honey Hive Pack": "1502942841603756164",
    "Hive Egg": "1502942925942816822",
    "Professor Bee": "1502942989390053426",
    "Honey Birds of Paradise": "1502943064141070517"
};

let isChecking = false;

let lastCombinedIds = '';


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

async function fetchAllEmbeds(channelId) {

    const channel = client.channels.cache.get(channelId);

    if (!channel) {
        console.log(`❌ Канал не найден: ${channelId}`);
        return null;
    }

    const messages = await channel.messages.fetch({ limit: 10 });

    const data = {
        eggs: [],
        seeds: [],
        coin: [],
        jelly: [],
        ids: {
            eggs: null,
            seeds: null,
            coin: null,
            jelly: null
        }
    };

    const sortedMessages =
        [...messages.values()]
        .sort((a, b) =>
            b.createdTimestamp - a.createdTimestamp
        );

    for (const msg of sortedMessages) {

        if (!msg.embeds?.length) continue;

        const embed = msg.embeds[0];

        const title = embed.title || '';

        const text =
            embed.description ||
            embed.fields?.map(f => f.value).join('\n') ||
            '';

        // 🥚 EGGS
        if (title.includes('Event Eggs Stock') &&
            data.eggs.length === 0
        ) {

            data.eggs = parseStockText(text);
            data.ids.eggs = msg.id;
        }

        // 🌱 SEEDS
        else if (title.includes('Honey Seed Shop Stock') &&
            data.seeds.length === 0
        ) {

            data.seeds = parseStockText(text);
            data.ids.seeds = msg.id;
        }

        // 🪙 COIN SHOP
        else if (title.includes('Honey Coin Shop Stock') &&
            data.coin.length === 0
        ) {

            const age =
                Date.now() - msg.createdTimestamp;

            // живёт только 5 минут
            if (age < 5 * 60 * 1000) {

                data.coin = parseStockText(text);
                data.ids.coin = msg.id;
            }
        }

        // 🍯 ROYAL JELLY
        else if (title.includes('Royal Jelly Shop Stock') &&
            data.jelly.length === 0
        ) {

            const age =
                Date.now() - msg.createdTimestamp;

            if (age < 5 * 60 * 1000) {

                data.jelly = parseStockText(text);
                data.ids.jelly = msg.id;
            }
        }
    }

    return data;
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

    if (!items.length) {
        return 'Nothing today 😔';
    }

    return items
        .map(i => `- ${i.raw} — ${i.count}`)
        .join('\n');
}

async function sendCombinedEmbed(data) {

    const fields = [];

    if (data.eggs.length > 0) {
        fields.push({
            name: "🥚 Bee Eggs",
            value: renderItems(data.eggs),
            inline: false
        });
    }

    if (data.seeds.length > 0) {
        fields.push({
            name: "🌱 Honey Seeds",
            value: renderItems(data.seeds),
            inline: false
        });
    }

    if (data.coin.length > 0) {
        fields.push({
            name: "🪙 Honey Coin Shop",
            value: renderItems(data.coin),
            inline: false
        });
    }

    if (data.jelly.length > 0) {
        fields.push({
            name: "🍯 Royal Jelly Shop",
            value: renderItems(data.jelly),
            inline: false
        });
    }

    const embed = {
        title: "🌱 GROW A GARDEN | EVENT STOCK",
        color: 0xff9900,
        fields,
        footer: {
            text: `Last update: ${new Date().toLocaleTimeString('en-GB')} UTC`
        },
        timestamp: new Date().toISOString()
    };

    const pingText = getPingText([
        ...data.eggs,
        ...data.seeds,
        ...data.coin,
        ...data.jelly
    ]);

    await axios.post(process.env.WEBHOOK_URL, {
        content: pingText || null,
        embeds: [embed]
    });

    console.log("📦 EVENT STOCK отправлен");
}

async function checkAllStocks() {

    if (isChecking) return;
    isChecking = true;

    try {

        console.log("🔄 Проверка event stock...");

        const data = await fetchAllEmbeds(
            process.env.EVENTS_CHANNEL_ID
        );

        if (!data) {
            console.log("❌ Нет данных");
            return;
        }

        const currentState = JSON.stringify(data.ids);

        if (currentState === lastCombinedIds) {
            console.log("⏸️ Уже обработано");
            return;
        }

        lastCombinedIds = currentState;

        await sendCombinedEmbed(data);

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

        setTimeout(() => {

            checkAllStocks()
                .finally(() => {
                    scheduleNext();
            });

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
