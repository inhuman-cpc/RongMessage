# RongMessage

## Usage

```js
import im from 'RongMessage'

im.connect(APP_KEY, USER_TOKEN)
im.emitter.addListener('message', msg => {
  // handle you message here
  console.log(msg)
})

im.sendText({
  receiver: 'user rong id',
  content: 'hello',
  extra: {
    chat_id: 'chatId',
    sender_name: 'simon',
    type: 'BUY',
    crypto_currency: 'BTC'
  },
  user: {
    userId: 100000,
    name: 'simon',
    portraitUri: 'https://www.icon.com/avatar.png'
  }
})

```