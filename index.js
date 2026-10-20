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

const GAG2_ROLE_IDS = {
    // 🌾 SEEDS
    "Dragon Fruit": "1515314576009334865",
    "Acorn": "1515315023990362172",
    "Cherry": "1515315150171930716",
    "Sunflower": "1515315202344747048",
    "Fire Fern": "1526208659070259231",
    "Venus Fly Trap": "1515315936570114098",
    "Pomegranate": "1515316156003647610",
    "Poison Apple": "1515316389106290860",
    "Venom Spitter": "1517764903685853214",
    "Moon Bloom": "1515316520539000924",
    "Sun Bloom": "1526208815652016178",
    "Dragon's Breath": "1515316706254393434",
    "Star Fruit": "1526209349381521549",

    // ⚙️ GEAR
    "Rare Sprinkler": "1515317503600103424",
    "Jump Mushroom": "1515317617177657477",
    "Speed Mushroom": "1515317753261854881",
    "Shrink Mushroom": "1515317882760859648",
    "Supersize Mushroom": "1515318035920195686",
    "Gnome": "1515318180569026570",
    "Flashbang": "1515318294574399610",
    "Basic Pot": "1515318480172224654",
    "Legendary Sprinkler": "1515321652450427001",
    "Invisibility Mushroom": "1515321812857131118",
    "Teleporter": "1515321959070830733",
    "Wheelbarrow": "1515322332489584791",
    "Super Watering Can": "1515485069991608532",
    "Super Sprinkler": "1515485174375125103",

    // 📦 PROPS
    "Roleplay Crate": "1515486757469294834",
    "Bridge Crate": "1515486884749377606",
    "Spring Crate": "1515487002747863050",
    "Seesaw Crate": "1515487109497094325",
    "Conveyor Crate": "1515487256347934730",
    "Owner Door Crate": "1515487376129134622",
    "Bear Trap Crate": "1515487489161429042",
    "Fence Crate": "1515487616429064342",
    "Teleporter Pad Crate": "1515487722049896598"
};

let isChecking = false;

let lastCombinedIds = '';
let lastGag2CombinedIds = '';

let isCheckingHalloween = false;
let lastHalloweenCombinedIds = '';

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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function postWebhookWithRetry(
    url,
    payload,
    webhookNumber,
    maxRetries = 2
) {
    let retry = 0;

    while (true) {
        try {
            return await axios.post(url, payload);

        } catch (error) {
            const status = error.response?.status;

            // Временные ошибки сервера
            const serverError =
                status === 500 ||
                status === 502 ||
                status === 503 ||
                status === 504;

            // Например ECONNRESET, ETIMEDOUT и т.п.
            const networkError = !error.response;

            // Discord rate limit
            const rateLimit = status === 429;

            const canRetry =
                serverError ||
                networkError ||
                rateLimit;

            if (!canRetry || retry >= maxRetries) {
                throw error;
            }

            let delay;

            if (rateLimit) {
                // Discord обычно отдаёт retry_after в секундах
                const retryAfter =
                    Number(error.response?.data?.retry_after) ||
                    Number(error.response?.headers?.['retry-after']);

                delay = retryAfter
                    ? Math.ceil(retryAfter * 1000)
                    : 5000;
            } else {
                // Первый retry через 2 сек, второй через 5 сек
                delay = retry === 0 ? 2000 : 5000;
            }

            retry++;

            console.warn(
                `⚠️ Webhook #${webhookNumber}: ${status || error.code || 'network error'}, ` +
                `повтор ${retry}/${maxRetries} через ${delay / 1000} сек.`
            );

            await sleep(delay);
        }
    }
}


async function sendToWebhooks(payload, urls) {

    const validUrls = urls.filter(Boolean);

    const results = await Promise.allSettled(
        validUrls.map((url, index) =>
            postWebhookWithRetry(
                url,
                payload,
                index + 1
            )
        )
    );

    results.forEach((result, index) => {

        if (result.status === 'fulfilled') {
            console.log(
                `✅ Webhook #${index + 1} отправлен`
            );
        } else {
            console.error(
                `❌ Webhook #${index + 1} ошибка после повторных попыток:`,
                result.reason?.message
            );
        }

    });
}

async function fetchAllEmbeds(channelId) {

    const channel = client.channels.cache.get(channelId);

    if (!channel) {
        console.log(`❌ Канал не найден: ${channelId}`);
        return null;
    }

    const messages = await channel.messages.fetch({ limit: 7 });

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

async function fetchHalloweenStocks() {

    const channel = client.channels.cache.get(
        "1382671962291175475"
    );

    if (!channel) {
        console.log("❌ Halloween канал не найден");
        return null;
    }

    const messages = await channel.messages.fetch({
        limit: 10
    });

    const result = {
        decor: [],
        seeds: [],
        fauna: [],

        ids: {
            decor: null,
            seeds: null,
            fauna: null
        },

        timestamps: {
            decor: null,
            seeds: null,
            fauna: null
        }
    };

    const titles = {
        decor: "demonic decor stock",
        seeds: "scary seeds stock",
        fauna: "frightening fauna stock"
    };

    const sorted = [...messages.values()].sort(
        (a, b) =>
            b.createdTimestamp -
            a.createdTimestamp
    );

    for (const msg of sorted) {

        if (!msg.embeds?.length) {
            continue;
        }

        for (const embed of msg.embeds) {

            const title = (embed.title || "")
                .toLowerCase()
                .trim();

            const type = Object.keys(titles).find(
                key => title.includes(titles[key])
            );

            if (!type || result.ids[type]) {
                continue;
            }

            const text =
                embed.description ||
                embed.fields
                    ?.map(f => f.value)
                    .join('\n') ||
                '';

            result[type] =
                parseStockText(text);

            result.ids[type] =
                msg.id;

            result.timestamps[type] =
                msg.createdTimestamp;
        }

        if (
            Object.values(
                result.ids
            ).every(Boolean)
        ) {
            break;
        }
    }

    return result;
}

async function fetchGag2Stocks() {

    const result = {
        seeds: [],
        gear: [],
        props: [],
        ids: {
            seeds: null,
            gear: null,
            props: null
        }
    };

    const channels = {
        seeds: client.channels.cache.get("1511902092372213832"),
        gear: client.channels.cache.get("1511902177067794532"),
        props: client.channels.cache.get("1515033494307209313")
    };

    for (const [type, channel] of Object.entries(channels)) {

        if (!channel) {
            console.log(`❌ GAG2 канал не найден: ${type}`);
            continue;
        }

        const messages =
            await channel.messages.fetch({ limit: 3 });

        const msg =
            messages
                .sort(
                    (a, b) =>
                    b.createdTimestamp -
                    a.createdTimestamp
                )
                .first();

        if (!msg || !msg.embeds?.length)
            continue;

        const embed = msg.embeds[0];

        const text =
            embed.description ||
            embed.fields?.map(f => f.value).join('\n') ||
            '';

        result[type] = parseStockText(
            text
                .replace(/•/g, '')
        );

        result.ids[type] = msg.id;
    }

    return result;
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

function getGag2PingText(data) {

    const pings = [];

    const allItems = [
        ...data.seeds,
        ...data.gear,
        ...data.props
    ];

    for (const item of allItems) {

        const cleanName = item.raw
            .replace(/^[^\p{L}]+/u, '')
            .trim();

        if (GAG2_ROLE_IDS[cleanName]) {
            pings.push(`<@&${GAG2_ROLE_IDS[cleanName]}>`);
        }
    }

    return [...new Set(pings)].join(' ');
}

function renderItems(items) {

    if (!items.length) {
        return 'Nothing today 😔';
    }

    return items
        .map(i => {

            const raw = i.raw.replace(
                /\u26D3(?:\uFE0F)?/g,
                '\u26D3\uFE0F'
            );

            return `- ${raw} — ${i.count}`;
        })
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

    await sendToWebhooks(
        {
            content: pingText || null,
            embeds: [embed]
        },
        [
            process.env.WEBHOOK_URL,
            process.env.KIRO_WEBHOOK_URL
        ]
    );

    console.log("📦 EVENT STOCK отправлен");
}

async function sendGag2Embed(data) {

    const fields = [];

    if (data.seeds.length > 0) {
        fields.push({
            name: "🌾 SEEDS",
            value: renderItems(data.seeds),
            inline: false
        });
    }

    if (data.gear.length > 0) {
        fields.push({
            name: "⚙️ GEAR",
            value: renderItems(data.gear),
            inline: false
        });
    }

    if (data.props.length > 0) {
        fields.push({
            name: "📦 PROPS",
            value: renderItems(data.props),
            inline: false
        });
    }

    const embed = {
        title: "🌱 GROW A GARDEN 2 | STOCK",
        color: 0x00ff88,
        fields,
        footer: {
            text: `Last update: ${new Date().toLocaleTimeString('en-GB')} UTC`
        },
        timestamp: new Date().toISOString()
    };

    const pingText = getGag2PingText(data);

    await sendToWebhooks(
        {
            content: pingText || null,
            embeds: [embed]
        },
        [
            process.env.GAG2_WEBHOOK_URL,
            process.env.KIRO_GAG2_WEBHOOK_URL
        ]
    );

    console.log("📦 GAG2 STOCK отправлен");
}

async function sendHalloweenEmbed(data) {

    const now = new Date();

    const embed = {
        title: "🎃 GROW A GARDEN | HALLOWEEN STOCK",
        color: 0xff5a36,

        fields: [
            {
                name: "👹 DEMONIC DECOR",
                value: renderItems(data.decor),
                inline: false
            },
            {
                name: "🌱 SCARY SEEDS",
                value: renderItems(data.seeds),
                inline: false
            },
            {
                name: "🦇 FRIGHTENING FAUNA",
                value: renderItems(data.fauna),
                inline: false
            }
        ],

        footer: {
            text: `Last update: ${now.toLocaleTimeString(
                'en-GB',
                { timeZone: 'UTC' }
            )} UTC`
        },

        timestamp: now.toISOString()
    };


    // ==========================================
    // 🎃 ПРОВЕРЯЕМ HAUNTED HALLOW
    // ==========================================

    const hasHauntedHallow =
        data.seeds.some(item => {

            const itemName =
                (item.raw || "")
                    .toLowerCase();

            return itemName.includes(
                "halloween haunted hallow"
            );
        });


    // ==========================================
    // ТВОЙ WEBHOOK
    // С ПИНГОМ, ЕСЛИ ЕСТЬ HAUNTED HALLOW
    // ==========================================

    const myPayload = {
        embeds: [embed]
    };


    if (
        hasHauntedHallow &&
        process.env.KOTIK_USER_ID
    ) {

        myPayload.content =
            `<@${process.env.KOTIK_USER_ID}>`;

        myPayload.allowed_mentions = {
            users: [
                process.env.KOTIK_USER_ID
            ]
        };


        console.log(
            "🚨 Halloween Haunted Hallow найден!"
        );

        console.log(
            "🔔 Отправляем личный пинг KotikGamerz"
        );
    }


    await sendToWebhooks(
        myPayload,
        [
            process.env.HALLOWEEN_WEBHOOK_URL
        ]
    );


    // ==========================================
    // WEBHOOK KIRO
    // ВСЕГДА БЕЗ ТВОЕГО ПИНГА
    // ==========================================

    await sendToWebhooks(
        {
            embeds: [embed]
        },
        [
            process.env.KIRO_HALLOWEEN_WEBHOOK_URL
        ]
    );


    console.log(
        "🎃 HALLOWEEN STOCK отправлен"
    );
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

async function checkGag2Stocks() {

    try {

        console.log("🌱 Проверка GAG2...");

        const data =
            await fetchGag2Stocks();

        if (
            !data.ids.seeds &&
            !data.ids.gear &&
            !data.ids.props
        ) {
            console.log("❌ GAG2 данных нет");
            return;
        }

        const currentState =
            JSON.stringify(data.ids);

        if (
            currentState ===
            lastGag2CombinedIds
        ) {

            console.log(
                "⏸️ GAG2 уже обработан"
            );

            return;
        }

        lastGag2CombinedIds =
            currentState;

        await sendGag2Embed(data);

    } catch (err) {

        console.error(
            "❌ GAG2 ошибка:",
            err.message
        );
    }
}

async function checkHalloweenStocks() {

    if (isCheckingHalloween) {

        console.log(
            "⏳ Halloween уже проверяется..."
        );

        return;
    }

    /*
        Halloween stock обновляется
        каждые 5 минут.

        Проверяем в минуту обновления
        и ещё раз через минуту,
        если три сообщения пришли
        не одновременно.
    */

    const minute =
        new Date().getUTCMinutes();

    const minuteInCycle =
        minute % 5;

    if (
        minuteInCycle !== 0 &&
        minuteInCycle !== 1
    ) {
        return;
    }


    isCheckingHalloween = true;


    try {

        console.log(
            "🎃 Проверка Halloween Stock..."
        );


        const data =
            await fetchHalloweenStocks();


        if (!data) {

            console.log(
                "❌ Halloween: нет данных"
            );

            return;
        }


        const types = [
            "decor",
            "seeds",
            "fauna"
        ];


        // Ждём все три сообщения
        if (
            types.some(
                type =>
                    !data.ids[type]
            )
        ) {

            console.log(
                "⌛ Halloween: ждём все три сообщения..."
            );

            return;
        }


        /*
            Все три сообщения одного
            рестока должны прийти
            почти одновременно.

            Если одно уже новое,
            а остальные старые,
            бот ничего не отправит.
        */

        const timestamps =
            types.map(
                type =>
                    data.timestamps[type]
            );


        const oldestTimestamp =
            Math.min(
                ...timestamps
            );


        const newestTimestamp =
            Math.max(
                ...timestamps
            );


        const messageGap =
            newestTimestamp -
            oldestTimestamp;


        if (
            messageGap >
            60 * 1000
        ) {

            console.log(
                "⌛ Halloween: сообщения из разных обновлений, ждём остальные..."
            );

            return;
        }


        const currentState =
            JSON.stringify(
                data.ids
            );


        if (
            currentState ===
            lastHalloweenCombinedIds
        ) {

            console.log(
                "⏸️ Halloween уже обработан"
            );

            return;
        }


        await sendHalloweenEmbed(
            data
        );


        lastHalloweenCombinedIds =
            currentState;


    } catch (err) {

        console.error(
            "❌ Halloween ошибка:",
            err.message
        );


    } finally {

        isCheckingHalloween =
            false;
    }
}

function startSmartScheduler() {

    const scheduleNext = () => {

        const now = new Date();
        const seconds =
            now.getSeconds();

        // Проверяем стоки
        // каждую минуту на :30
        const delay =
            seconds < 30
                ? (30 - seconds) * 1000
                : (90 - seconds) * 1000;


        console.log(
            `⏱️ Следующая проверка через ${
                delay / 1000
            }s`
        );


        setTimeout(() => {

            Promise.all([
                checkAllStocks(),
                checkGag2Stocks(),
                checkHalloweenStocks()
            ])
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
