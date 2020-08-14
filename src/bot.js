process.env.NTBA_FIX_319 = 1;

let TelegramBot = require('node-telegram-bot-api');
let emoji = require('node-emoji');
let request = require('request-promise');
let winston = require('winston');

let TOKEN = process.env.TELEGRAM;
let WEATHER_TOKEN = process.env.WEATHER;
let CALVIN = 271;

let telegram = initTelegram(TOKEN);
let workingBot;

const myFormat = winston.format.printf(info => {
  return `${info.timestamp} ${info.level}: ${info.message}`
})

let log = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp(),
        myFormat
    ),
    transports: [
        new (winston.transports.Console),
    ],
    exitOnError: false,
});

log.info("----------");

telegram.getMe().then(data => {
    log.info(`Connect to @${data.username} telegram bot`);
    workingBot = data;
    funcTelegram(telegram);
}).catch(error => {
    log.error(`ERROR Telegram getMe error: ${error.toString()}`);
    setTimeout(function(){ process.exit(-1); }, 1000);
});



function funcTelegram(telegram){

    telegram.on('message', function(msg){
        if(msg.via_bot != undefined && msg.via_bot.id == workingBot.id){
            return;
        }

        let message = `This bot works with inline mode. Just start message from bot name (<code>@${workingBot.username}</code>) in any chat.`;
        telegram.sendMessage(msg.chat.id, message, { 'parse_mode': 'html', 'disable_web_page_preview': true }).catch(error => {
            log.error(`sendMessage error: ${error.toString()}`);
        });
    });

    telegram.on('callback_query', function (msg) {
        let data = msg.data.split('|');
        if(data[0] != "refresh"){
            return;
        }

        let town = data[1];

        getWeather(town).then(weather => {
            telegram.editMessageText(`${generateMessage(weather)}\n\n${smartWeatherAdvice(weather)}`, {
                'inline_message_id': msg.inline_message_id,
                'reply_markup': JSON.stringify({"inline_keyboard": 
                    [ 
                        [{'text':`${emoji.get('repeat')} Refresh`, "callback_data": `refresh|${town}`}], 
                    ]
                }),
                'selective': true,
                'parse_mode': 'html',
                'disable_web_page_preview': true,
            }).then(() => {
                telegram.answerCallbackQuery(msg.id, `The weather for ${town} updated`, false);
            }).catch(error => {
                if(error.toString().indexOf('message is not modified') != -1){
                    telegram.answerCallbackQuery(msg.id, `The weather for ${town} updated`, false);
                    return;
                }
                telegram.answerCallbackQuery(msg.id, `Something wrong`, false);
                log.error(`editMessageText error: ${error.toString()}`);
            });
        }, error => {
            telegram.answerCallbackQuery(msg.id, `Something wrong`, false);
        })
        
        
    });

    telegram.on("polling_error", (err) => log.error(err));

    telegram.on("inline_query", function (query) {

        let town = query.query;
        let inline = [{
            id: '0',
            type: 'article',
            title: 'City not found',
            description: '',
            input_message_content: {
                message_text: '<b>MyForecasterBot</b>\n\nCity not found',
                parse_mode: 'html',
                selective: true,
            },
        }];

        getWeather(town).then(weather => {
            try {
                inline[0].title = weather.name;
                inline[0].description = `Min: ${(weather.main.temp_min - CALVIN).toFixed(0)}C, Max: ${(weather.main.temp_max - CALVIN).toFixed(0)}C`;
                inline[0].input_message_content.message_text = `${generateMessage(weather)}\n\n${smartWeatherAdvice(weather)}`;
                inline[0].reply_markup = {
                    "inline_keyboard": [
                        [{'text':`${emoji.get('repeat')} Refresh`, 'callback_data': `refresh|${town}`}],
                    ],
                }
            } catch(e) {}
        }, error => {
            // todo: somethink
        }).finally(() => {
            telegram.answerInlineQuery(query.id, inline);
        });

    });
}

function generateMessage(weather){
    let message = `<b>${weather.name}</b>\n\nMin: ${(weather.main.temp_min - CALVIN).toFixed(0)}C, Max: ${(weather.main.temp_max - CALVIN).toFixed(0)}C\n${weather.weather[0].description}`;
    return message;
}

function smartWeatherAdvice(weather){
    let advice = "<i>Smart advice on how to dress:</i>";

    if(weather.main.feels_like - CALVIN < 0){
        advice += "\n - Dress warmly";
    } else if(weather.main.feels_like - CALVIN > 30){
        advice += "\n - Choose closes made from breathable materials";
    } else {
        advice += "\n - Wear appropriately";
    }

    if(weather.weather[0].main.toLowerCase().indexOf("rain") != -1){
        advice += "\n - Take an umbrella with you"
    } else if(weather.weather[0].main.toLowerCase().indexOf("sun") != -1){
        advice += "\n - Dont forget wear sunglasses";
    }

    return advice
}

function getWeather(town){
    return new Promise(function(ok, fail){
        request(`http://api.openweathermap.org/data/2.5/weather?q=${town}&appid=${WEATHER_TOKEN}`).then(weather => {
            try{
                ok(JSON.parse(weather));
            } catch(e) {
                fail(e.toString());
            }
        }).catch(error => { 
            fail(error) 
        });
    });
}

function initTelegram(token){
    let telegramSettins = {
        polling: true,
    };
    
    return new TelegramBot(token, telegramSettins);
}
