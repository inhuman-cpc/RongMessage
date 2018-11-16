/**
 * 融云聊天消息扩展，登录后可用
 * 需要使用 script 引入融云脚本，避免打包到公共脚本
 */

import { EventEmitter } from 'fbemitter'

const { RongIMClient, RongIMLib } = window
const emitter = new EventEmitter()
// 自动重连机制
const reconnectConfig = {
  auto: true,
  url: '//files-alocnioc-1251297012.cos.ap-hongkong.myqcloud.com/libs/RongIMLib-2.3.0.min.js',
  // 重试频率
  rate: [1000, 10000, 30000, 60000, 180000]
}
const callbackConfig = {
  onSuccess: uid => {
    emitter.emit('success', uid)
  },
  onTokenIncorrect: () => {
    emitter.emit('error', new Error('TOKEN_INCORRECT'))
  },
  onError: errorCode => {
    emitter.emit('error', new Error(errorCode))
  }
}

export const SYSTEM_TIP_TYPE_LIST =  ['MILD', 'MODERATE', 'SEVERE']

export const CUSTOMER_SERVICE_TYPE = 'CUSTOMER_SERVICE'

export const utils = {
  // 我发送的消息
  isSentMessage: msg => msg.messageDirection === RongIMLib.MessageDirection.SEND,
  // 我接收的消息
  isReceivedMessage: msg => msg.messageDirection === RongIMLib.MessageDirection.RECEIVE,
  // 私聊消息
  isPrivateMessage: msg => msg.conversationType === RongIMLib.ConversationType.PRIVATE,
  // 是否群组消息
  isGroupMessage: msg => msg.conversationType === RongIMLib.ConversationType.GROUP,
  // 是否客服消息
  isFromCustomerService: msg => msg.content.extra.type === CUSTOMER_SERVICE_TYPE,
  // 是否系统消息
  isSystemMessage: msg => msg.conversationType === RongIMLib.ConversationType.SYSTEM,
  // 是否是新版系统提示消息
  isSystemAlertMessage: msg => {
    return msg.conversationType === RongIMLib.ConversationType.SYSTEM && SYSTEM_TIP_TYPE_LIST.indexOf(msg.content.extra.type) > -1
  },
  // 文本消息
  isTextMessage: msg => msg.content.messageName === 'TextMessage',
  // 图片消息
  isImageMessage: msg => msg.content.messageName === 'ImageMessage',
  // 是否离线消息，表示在其它终端接收过
  isOfflineMessage: msg => !!msg.offLineMessage
}

// NOTE message 结构体
// ** content **  消息内容。
// ** conversationType **  会话类型，1 为单聊、3 为群组、4 为聊天室、5 为客服、6 为系统、7 为应用公众服务，8 为公有公众服务。
// ** messageDirection **   消息方向，1 为发送的消息、2 为接收的消息。
// ** targetId **   目标 Id。
// ** messageType **   消息类型，详细请查看消息类型说明。
// ** messageUId **  消息在融云服务端的唯一标识，通过 messageUId 进行消息撤回操作。
// ** offLineMessage ** 是否为离线消息，true 为离线消息，false 为非离线消息。
// messageId   本地生成的消息 Id。
// sentStatus   10 为发送中、20 为发送失败、30 为已发送、40 为对方已接收、50 为对方已读、60 为对方已销毁
// receivedTime   应用接收到消息的本地时间。
// senderUserId   发送方 Id。
// sentTime   消息在融云服务端的发送时间。
// objectName   消息标识，融云内置消息以 "RC:" 开头。融云内置消息类型表
function normalizeMessage (message) {
  /**
   * 系统消息 extra 包含字段：chat_id, sender_name, type, crypto_currency, stage
   * 私聊消息 extra 包含字段：chat_id, sender_name, type, crypto_currency
   * 群组消息 extra 包含字段：chat_id, sender_name, type, crypto_currency
   */
  let { extra, content } = message.content
  if (typeof extra === 'string') {
    extra = JSON.parse(extra)
    message.content.extra = extra
  }

  if (!extra.chat_id) {
    throw new Error('Missing chat id in extra')
  }

  message.chatId = extra.chat_id

  // emoji 表情转换
  if (utils.isTextMessage(message)) {
    message.content.content = RongIMLib.RongIMEmoji.symbolToEmoji(content)
  }

  return message
}

/**
 * 连接融云
 * http://www.rongcloud.cn/docs/web_api_demo.html#init
 */
function connect (rongId, token) {
  RongIMClient.init(rongId)
  RongIMClient.connect(token, callbackConfig)
  RongIMLib.RongIMEmoji.init()

  // 对方推送的消息在这里接受
  RongIMClient.setOnReceiveMessageListener({
    onReceived: message => {
      emitter.emit('message', normalizeMessage(message))
    }
  })

  RongIMClient.setConnectionStatusListener({
    // 0: "CONNECTED"
    // 1: "CONNECTING"
    // 2: "DISCONNECTED"
    // 3: "NETWORK_UNAVAILABLE"
    // 4: "CONNECTION_CLOSED"
    // 6: "KICKED_OFFLINE_BY_OTHER_CLIENT"
    // 12: "DOMAIN_INCORRECT"
    onChanged: status => {
      emitter.emit('statusChanged', status)
    }
  })


  /**
   * 多标签页抢占消息推送
   */
  // document.addEventListener('visibilitychange', function () {
  //   const instance = RongIMClient.getInstance()
  //   if (document.visibilityState === 'visible') {
  //     if (instance.getCurrentConnectionStatus() > RongIMLib.ConnectionStatus.CONNECTING) {
  //       reconnect()
  //     }
  //   } else {
  //     instance.disconnect()
  //   }
  // })
}

/**
 * 发送文本消息，发送成功后返回融云消息体
 * receiver: 接收方，对方 rong id 或者 group id
 * content: 文本内容
 * extra: 附加消息 {chat_id, sender_name, type, crypto_currency}
 * user: 当前用户信息 {userId, name, portraitUri}
 * conversationType: RongIMLib.ConversationType.PRIVATE / GROUP
 */
function sendText ({receiver, content, extra, user}, conversationType = RongIMLib.ConversationType.PRIVATE) {
  return new Promise((resolve, reject) => {
    const msg = new RongIMLib.TextMessage({content, extra: JSON.stringify(extra), user})
    RongIMClient.getInstance().sendMessage(conversationType, receiver, msg, {
      onSuccess: function (message) {
        resolve(normalizeMessage(message))
      },
      onError: function (errorCode, message) {
        reject(new Error(errorCode + message))
      }
    })
  })
}

/**
 * 发送图片消息，发送成功后返回融云消息体
 * receiver: 接收方，对方 rong id 或者 group id
 * content: 缩略图内容 base64
 * imageUri: 原图网络地址
 * extra: 附加消息 {chat_id, sender_name, type, crypto_currency}
 * user: 当前用户信息 {userId, name, portraitUri}
 * conversationType: RongIMLib.ConversationType.PRIVATE / GROUP
 */
function sendImage ({receiver, content, extra, imageUri, user}, conversationType = RongIMLib.ConversationType.PRIVATE) {
  return new Promise((resolve, reject) => {
    const message = new RongIMLib.ImageMessage({content, imageUri, extra: JSON.stringify(extra), user})
    RongIMClient.getInstance().sendMessage(conversationType, receiver, message, {
      onSuccess: function (message) {
        resolve(normalizeMessage(message))
      },
      onError: function (errorCode, message) {
        reject(new Error(errorCode + message))
      }
    })
  })
}

function reconnect () {
  RongIMClient.reconnect(callbackConfig, reconnectConfig)
}

export default {
  connect,
  reconnect,
  sendText,
  sendImage,
  isConnected: () => RongIMClient.getInstance().getCurrentConnectionStatus() === RongIMLib.ConnectionStatus.CONNECTED,
  currentStatus: () => RongIMClient.getInstance().getCurrentConnectionStatus(),
  currentStatusText: () => RongIMLib.ConnectionStatus[RongIMClient.getInstance().getCurrentConnectionStatus()],
  emitter
}
