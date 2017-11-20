/*
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* jshint node: true, devel: true */
'use strict'

// all prodcuts information
let productsLoaded = false
let productJson = []
let productsInCart = []
var senderID = 0
let applyShippingFree = false
var productNames = [
  'Leggings',
  'Tank',
  'Yoga',
  'CAPRI',
  'Pullover',
  'Bra',
  'Pant',
  'T-Shirt',
  'Shorts',
  'Hoodie',
  'Top',
  'Trousers',
  'Jacket',
  'Sweatshirt',
  'Capri',
  'BRATOP',
  'TShirt',
  'Pants',
  'Legging',
  'Leggings',
  'Hoodie',
  'Bra',
  'Set',
  'Tank',
  'Top',
  'Trousers',
  'Jacket',
  'PDX',
  'towel PDX',
  'Pullover',
  'tank top',
  'Yoga Set',
  'Sports Bra',
  'Yoga Pants',
  'Running Shorts',
  'BRATOP',
  'Legging'
]

// Azure
let azuerUri = 'westcentralus.api.cognitive.microsoft.com' // westus.api.cognitive.microsoft.com
let KeyPhrasePath = '/text/analytics/v2.0/keyPhrases'
let azureAccessKey = 'eb01336c87224b9497fc001935640b3f'

var userInputText = ''

let responseHandler = function (response) {
  let body = ''
  response.on('data', function (d) {
    body += d
  })
  response.on('end', function () {
    let body_ = JSON.parse(body)
    let body__ = JSON.stringify(body_, null, '  ')
    console.log('AZURE result: ', body__)
    let searchWords = body_.documents[0].keyPhrases
    console.log('keyPhrases form Azure:', searchWords)
    let splitSearchWords = []
    if (searchWords.length > 0) {
      // use keyPhrases
      splitSearchWords = searchWords[0].split(' ')
    } else {
      // reuse input with word length > 2
      let userInputs = userInputText.split(' ')
      for (let i = 0; i < userInputs.length; i++) {
        if (userInputs[i].length > 2) {
          splitSearchWords.push(userInputs[i])
        }
      }
    }

    // check if splitSearchWords array have product name
    let foundProduct = ''
    for (let i = 0; i < splitSearchWords.length; i++) {
      productNames.forEach(function (name) {
        if (name.toUpperCase().includes(splitSearchWords[i].toUpperCase())) {
          foundProduct = name
        }
      })
    }

    if (foundProduct !== '') {
      let payload = {
        names: foundProduct,
        action: 'QR_PRODUCT_SEARCH'
      }
      respondToHelpRequestWithTemplates(senderID, JSON.stringify(payload))
    } else {
      // let message = `Sorry, we don't have "${splitSearchWords.join(' ')}" but how about this?`
      let message = `Thank you for asking "${splitSearchWords.join(' ')}." It looks like we don't have it but I'll search for inventory.`
      returnMessageToUser(message)
      // need to search with other word
      let payload = {
        names: splitSearchWords.join(' '),
        action: 'QR_PRODUCT_SEARCH'
      }
      setTimeout(function () {
        respondToHelpRequestWithTemplates(senderID, JSON.stringify(payload))
      }, 200)
    }
  })
  response.on('error', function (e) {
    console.log('AZURE Error: ' + e.message)
  })
}

let _getKeyPhrases = function (documents) {
  let body = JSON.stringify(documents)
  console.log(body)

  let requestParams = {
    method: 'POST',
    hostname: azuerUri,
    path: KeyPhrasePath,
    headers: {
      'Ocp-Apim-Subscription-Key': azureAccessKey
    }
  }

  let req = https.request(requestParams, responseHandler)
  req.write(body)
  req.end()
}

const bodyParser = require('body-parser')
const config = require('config')
const crypto = require('crypto')
const express = require('express')
const https = require('https')
const request = require('request')
const Shopify = require('shopify-api-node')

var app = express()
app.set('port', process.env.PORT || 5000)
app.set('view engine', 'ejs')
app.use(bodyParser.json({ verify: verifyRequestSignature }))
app.use(express.static('public'))

/*
 * Open config/default.json and set your config values before running this code.
 * You can also set them using environment variables.
 *
 */

// App Secret can be retrieved from the App Dashboard
const FB_APP_SECRET = (process.env.FB_APP_SECRET) ? process.env.FB_APP_SECRET : config.get('fb_appSecret')
// Arbitrary value used to validate a webhook
const FB_VALIDATION_TOKEN = (process.env.FB_VALIDATION_TOKEN) ? (process.env.FB_VALIDATION_TOKEN) : config.get('fb_validationToken')
// Generate a page access token for your page from the App Dashboard
const FB_PAGE_ACCESS_TOKEN = (process.env.FB_PAGE_ACCESS_TOKEN) ? (process.env.FB_PAGE_ACCESS_TOKEN) : config.get('fb_pageAccessToken')
// Settings for Shopify
const SHOPIFY_SHOP_NAME = (process.env.SHOP_NAME) ? process.env.SHOP_NAME : config.get('sh_shopName')
const SHOPIFY_API_KEY = (process.env.SHOP_API_KEY) ? process.env.SHOP_API_KEY : config.get('sh_apiKey')
const SHOPIFY_API_PASSWORD = (process.env.SHOP_API_PASSWORD) ? process.env.SHOP_API_PASSWORD : config.get('sh_apiPassword')

const HOST_URL = (process.env.HOST_URL) ? process.env.HOST_URL : config.get('host_url')

// make sure that everything has been properly configured
if (!(FB_APP_SECRET && FB_VALIDATION_TOKEN && FB_PAGE_ACCESS_TOKEN && SHOPIFY_SHOP_NAME && SHOPIFY_API_KEY && SHOPIFY_API_PASSWORD && HOST_URL)) {
  console.error('Missing config values')
  process.exit(1)
}

const shopify = new Shopify({
  shopName: SHOPIFY_SHOP_NAME,
  apiKey: SHOPIFY_API_KEY,
  password: SHOPIFY_API_PASSWORD
})

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * your App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature (req, res, buf) {
  var signature = req.headers['x-hub-signature']
  if (!signature) {
    // In DEV, log an error. In PROD, throw an error.
    console.error("Couldn't validate the signature.")
  } else {
    var elements = signature.split('=')
    // var method = elements[0]
    var signatureHash = elements[1]
    var expectedHash = crypto.createHmac('sha1', FB_APP_SECRET)
                        .update(buf)
                        .digest('hex')
    if (signatureHash !== expectedHash) {
      throw new Error("Couldn't validate the request signature.")
    }
  }
}

/*
 * Use your own validation token. Check that the token used in the Webhook
 * setup is the same token used here.
 *
 */
app.get('/webhook', function (req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === FB_VALIDATION_TOKEN) {
    console.log("[app.get] Validating 'webhook'")
    res.status(200).send(req.query['hub.challenge'])
  } else {
    console.error("Failed validation. Make sure the 'validation tokens' match.")
    res.sendStatus(403)
  }
})

/**
 * serves a static page for the webview
 */
app.get('/product_description', function (req, res) {
  var productId = req.query['id']
  if (productId !== 'null') {
    console.log("[app.get] product 'id':" + productId)
    var shProduct = shopify.product.get(productId)
    shProduct.then(function (product) {
      console.log(product.options[0].values)
      res.status(200).send(product.body_html)
    }, function (error) {
      console.error("'Error' retrieving product", error)
      res.sendStatus(400).send("'Error' retrieving product")
    })
  } else {
    console.error("'Product id' is required")
    res.sendStatus(400).send("'Product id' is required")
  }
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page.
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook', function (req, res) {
  // You must send back a status 200 to let the Messenger Platform know that you've
  // received the callback. Do that right away because the countdown doesn't stop when
  // you're paused on a breakpoint! Otherwise, the request might time out.
  res.sendStatus(200)
  var data = req.body

  // Make sure this is a page subscription
  if (data.object === 'page') {
    // entries may be batched so iterate over each one
    data.entry.forEach(function (pageEntry) {
      var pageID = pageEntry.id
      var timeOfEvent = pageEntry.time
      console.log('pageID and timeOfEvent', pageID, timeOfEvent)
      // iterate over each messaging event
      pageEntry.messaging.forEach(function (messagingEvent) {
        let propertyNames = []
        for (var prop in messagingEvent) { propertyNames.push(prop) }
        console.log("[app.post] 'Webhook' received a messagingEvent with properties: ", propertyNames.join())

        if (messagingEvent.message) {
          senderID = messagingEvent.sender.id
          // someone sent a message
          receivedMessage(messagingEvent)
        } else if (messagingEvent.delivery) {
          // messenger platform sent a delivery confirmation
          receivedDeliveryConfirmation(messagingEvent)
        } else if (messagingEvent.postback) {
          // user replied by tapping one of our postback buttons
          receivedPostback(messagingEvent)
        } else {
          console.log("[app.post] 'Webhook' is not prepared to handle this message.")
        }
      })
    })
  }
})

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message'
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 *
 */
function receivedMessage (event) {
  senderID = event.sender.id
  var pageID = event.recipient.id
  var timeOfMessage = event.timestamp
  var message = event.message

  console.log('productsLoaded', productsLoaded)

  console.log("'[receivedMessage]' user (%d) page (%d) timestamp (%d) and message (%s)",
    senderID, pageID, timeOfMessage, JSON.stringify(message))

  if (message.quick_reply) {
    console.log("[receivedMessage] 'quick_reply.payload' (%s)",
      message.quick_reply.payload)
    handleQuickReplyResponse(event)
    return
  }

  var messageText = message.text
  userInputText = messageText
  if (messageText) {
    let doc = {
      id: '1',
      text: messageText
    }
    let docs = []
    docs.push(doc)
    let document = {
      documents: docs
    }

    var lcm = messageText.toLowerCase()
    if (lcm === 'help') {
      returnMessageToUser(lcm)
    } else if (lcm.includes('ship')) {
      applyShippingFree = true
      returnMessageToUser('Thank you for your first purchase, we will ship it free.')
      setTimeout(function () {
        let payload = {
          action: 'QR_SHOW_CART'
        }
        respondToHelpRequestWithTemplates(senderID, JSON.stringify(payload))
      }, 500)
    } else if (lcm.includes('who')) {
      returnMessageToUser('I\'m Bonnie. Thanks.')
    } else if (lcm.includes('cart')) {
      sendTextMessage(senderID, 'Let\'s see what\'s in your cart :)')
      let payload = {
        action: 'QR_SHOW_CART'
      }
      respondToHelpRequestWithTemplates(senderID, JSON.stringify(payload))
    } else {
      _getKeyPhrases(document) // Azure API call
    }
  }
}

function returnMessageToUser (lcm) {
  switch (lcm) {
    // if the text matches any special keywords, handle them accordingly
    case 'help':
      sendHelpOptionsAsButtonTemplates(senderID)
      break
    default:
      // otherwise, just echo it back to the sender
      sendTextMessage(senderID, lcm)
  }
}

/*
 * Send a message with buttons.
 *
 */
function detailButton (url) {
  return {
    type: 'web_url',
    url: url,
    title: 'Read description',
    webview_height_ratio: 'compact',
    messenger_extensions: 'true'
  }
}

function _calculateShippingFee (weight) {
  let fee = 0
  if (weight <= 1) {
    fee = 5.00
  } else if (weight <= 2) {
    fee = 8.00
  } else {
    fee = 10.00
  }
  if (applyShippingFree) {
    fee = 0
  }
  return parseFloat(fee)
}

function _removeFromCart (id) {
  var removedProduct = null
  for (var i = productsInCart.length - 1; i >= 0; --i) {
    if (productsInCart[i].id === id) {
      removedProduct = productsInCart[i]
      productsInCart.splice(i, 1)
    }
  }
  return removedProduct
}

function _searchById (id, productList) {
  console.log('id: ', id)
  console.log('length of list', productList.length)
  var foundProduct = null
  productList.forEach(function (product) {
    if (id === product.id) {
      console.log('Found the product')
      foundProduct = product
    }
  })
  return foundProduct
}

function _showSelectedProductsAsMessage (productList, recipientId) {
  console.log('JR productList', recipientId, productList.length)
  var templateElements = []

  productList.forEach(function (product) {
    var url = HOST_URL + '/product.html?id=' + product.id
    console.log('_showSelectedProductsAsMessage', product, product.id, product.title, product.tags, product.image)
    if (product.id && product.title && product.tags && product.image) {
      templateElements.push({
        title: product.title,
        subtitle: product.tags,
        image_url: product.image.src,
        buttons: [
          detailButton(url),
          sectionButton('Get options', 'QR_GET_PRODUCT_OPTIONS', {id: product.id}),
          sectionButton('Add to cart', 'QR_ADD_TO_CART', {id: product.id})
        ]
      })
    }
  })

  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: templateElements
        }
      }
    }
  }

  if (templateElements.length < 1) {
    // returnMessageToUser('Sorry, no product found for you.')
    let payload = {
      again: true,
      action: 'GET_STARTED'
    }
    respondToHelpRequestWithTemplates(senderID, JSON.stringify(payload))
  } else {
    callSendAPI(messageData)
  }
}

function _showCart (recipientId) {
  if (productsInCart.length === 0) {
    sendTextMessage(recipientId, 'Nothing is in your cart!')
  } else {
    var templateElements = []
    var totalPrice = 0
    var totalWeight = 0

    productsInCart.forEach(function (product) {
      totalPrice += parseFloat(product.variants[0].price)
      totalWeight += parseFloat(product.variants[0].weight)

      var url = HOST_URL + '/product.html?id=' + product.id
      console.log('_showSelectedProductsAsMessage', product, product.id, product.title, product.tags, product.image)
      if (product.id && product.title && product.tags && product.image) {
        templateElements.push({
          title: product.title,
          subtitle: product.tags,
          image_url: product.image.src,
          buttons: [
            detailButton(url),
            sectionButton('Get options', 'QR_GET_PRODUCT_OPTIONS', {id: product.id}),
            sectionButton('Remove from cart', 'QR_REMOVE_FROM_CART', {id: product.id})
          ]
        })
      }
    })

    var messageData = {
      recipient: {
        id: recipientId
      },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: templateElements
          }
        }
      }
    }
    callSendAPI(messageData)

    // Send cost info here

    let shippingCost = _calculateShippingFee(totalWeight)
    let cost = shippingCost + totalPrice
    let msgString = 'You have ' + productsInCart.length + ' items in your cart\nPrice: $' + totalPrice.toFixed(2) +
      '\nShipping cost: $' + shippingCost + '\nTotal cost: $' + cost.toFixed(2)

    setTimeout(function () {
      sendTextMessage(recipientId, msgString)
    }, 500)

    setTimeout(function () {
      sendBuyOptionsAsButtonTemplates(recipientId, productsInCart)
    }, 1000)
  }
}

function sectionButton (title, action, options) {
  var payload = options | {}
  payload = Object.assign(options, {action: action})
  return {
    type: 'postback',
    title: title,
    payload: JSON.stringify(payload)
  }
}

function textButton (title, action, options) {
  var payload = options | {}
  payload = Object.assign(options, {action: action})
  return {
    content_type: 'text',
    title: title,
    payload: JSON.stringify(payload)
  }
}

function sendShowCartAsButtonTemplates (recipientId, message) {
  console.log("[sendShowCartAsButtonTemplates] Sending the 'cart' options menu")
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: message,
          buttons: [
            sectionButton('Check Cart', 'QR_SHOW_CART', {}),
            sectionButton('Keep Shopping', 'QR_KEEP_SHOPPING', {})
          ]
        }
      }
    }
  }

  callSendAPI(messageData)
}

function sendBuyOptionsAsButtonTemplates (recipientId, products) {
  console.log("[sendHelpOptionsAsButtonTemplates] Sending the 'buy' options menu")
  let purchasedItems = []
  products.forEach(function (product) {
    purchasedItems.push(product.title)
  })
  let purchasedItemsName = purchasedItems.join('\n')

  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: 'Click "Buy Now" if you are ready.',
          buttons: [
            sectionButton('Buy Now', 'QR_BUY_ITEM', {item: purchasedItemsName}),
            sectionButton('Keep Shopping', 'QR_KEEP_SHOPPING', {})
          ]
        }
      }
    }
  }

  callSendAPI(messageData)
}

function sendReviewAsButtonTemplates (recipientId) {
  console.log("[sendHelpOptionsAsButtonTemplates] Sending the 'buy' options menu")

  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: 'Now, you can review your purchase.',
          buttons: [
            sectionButton('Review Purchase', 'QR_REVIEW_PURCHASE', {}),
            sectionButton('Keep Shopping', 'QR_KEEP_SHOPPING', {})
          ]
        }
      }
    }
  }

  callSendAPI(messageData)
}

function sendHelpOptionsAsButtonTemplates (recipientId) {
  console.log("[sendHelpOptionsAsButtonTemplates] Sending the 'help' options menu")
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: 'Click the button before to get a list of 3 of our products.',
          buttons: [
            {
              type: 'postback',
              title: 'Get 3 products',
              payload: JSON.stringify({action: 'QR_GET_PRODUCT_LIST', limit: 3})
            }
            // limit of three buttons
          ]
        }
      }
    }
  }

  callSendAPI(messageData)
}

/*
 * Someone tapped one of the Quick Reply buttons so
 * respond with the appropriate content
 *
 */
function handleQuickReplyResponse (event) {
  var senderID = event.sender.id
  var pageID = event.recipient.id
  var message = event.message
  var quickReplyPayload = message.quick_reply.payload

  console.log("[handleQuickReplyResponse] Handling 'quick reply' response (%s) from sender (%d) to page (%d) with message (%s)",
    quickReplyPayload, senderID, pageID, JSON.stringify(message))

  // use branched conversation with one interaction per feature (each of which contains a variable number of content pieces)
  respondToHelpRequestWithTemplates(senderID, quickReplyPayload)
}

/*
 * This response uses templateElements to present the user with a carousel
 * You send ALL of the content for the selected feature and they can
 * swipe from side to side to see it
 *
 */
function respondToHelpRequestWithTemplates (recipientId, requestForHelpOnFeature) {
  console.log('[respondToHelpRequestWithTemplates] handling help request for %s', requestForHelpOnFeature)
  var templateElements = []
  var requestPayload = JSON.parse(requestForHelpOnFeature)

  switch (requestPayload.action) {
    case 'GET_STARTED':
      var text = _getGreetings() + ' I am Bonnie. Your personal shooper. I\'m here to help you shopping. Ask me about items or please select one of popular options below.'
      if (requestPayload.again === true) {
        text = "Sorry we couldn't find what you were looking for. Try other options."
      }
      var buttons = [
        sectionButton('Latest products', 'QR_NEW_PRODUCT', {}),
        sectionButton('Hot deal', 'QR_DISCOUNTED_PRODUCT', {}),
        sectionButton('Bestsellers', 'QR_PRODUCT_SEARCH', {})
      ]
      _sendMessageWithButtons(recipientId, text, buttons)
      break

    case 'QR_GET_PRODUCT_LIST':
      var products = shopify.product.list({limit: requestPayload.limit})
      products.then(function (listOfProducs) {
        listOfProducs.forEach(function (product) {
          var url = HOST_URL + '/product.html?id=' + product.id
          templateElements.push({
            title: product.title,
            subtitle: product.tags,
            image_url: product.image.src,
            buttons: [
              {
                type: 'web_url',
                url: url,
                title: 'Read description',
                webview_height_ratio: 'compact',
                messenger_extensions: 'true'
              },
              sectionButton('Get options', 'QR_GET_PRODUCT_OPTIONS', {id: product.id})
            ]
          })
        })

        var messageData = {
          recipient: {
            id: recipientId
          },
          message: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'generic',
                elements: templateElements
              }
            }
          }
        }

        callSendAPI(messageData)
      })
      break

    case 'QR_KEEP_SHOPPING':
      let messageText = 'I have best deal for you, or you can type what you are looking for.'
      let keepButtons = [
        sectionButton('Hot deal', 'QR_DISCOUNTED_PRODUCT', {}),
        sectionButton('Bestsellers', 'QR_PRODUCT_SEARCH', {})
      ]
      if (productsInCart.length > 0) {
        keepButtons.push(sectionButton('Check Cart', 'QR_SHOW_CART', {}))
      }
      _sendMessageWithButtons(recipientId, messageText, keepButtons)
      break

    case 'QR_BUY_ITEM':
      productsInCart = [] // empty cart
      let purchasedItem = requestPayload.item
      let mesaage = `Thank you for purchasing ${purchasedItem}. We will ship it sooner and let you know.`
      sendTextMessage(recipientId, mesaage)
      setTimeout(function () {
        sendReviewAsButtonTemplates(recipientId)
      }, 500)
      break

    case 'QR_SHOW_CART':
      _showCart(recipientId)
      break

    case 'QR_REMOVE_FROM_CART':
      console.log('cart size before removing: ', productsInCart.length)
      var removedProduct = _removeFromCart(requestPayload.id)
      console.log('cart size after removing: ', productsInCart.length)
      sendTextMessage(recipientId, removedProduct.title + 'was removed from your cart!')
      break

    case 'QR_ADD_TO_CART':
      let product = _searchById(requestPayload.id, productJson)
      let msg = `Thank you. "${product.title}" was added to your cart.`
      productsInCart.push(product)
      sendTextMessage(recipientId, msg)
      setTimeout(function () {
        let message = `You can type "cart" whenever you want to check your cart or click button.`
        sendShowCartAsButtonTemplates(recipientId, message)
      }, 500)
      break

    case 'QR_NEW_PRODUCT':
      _showSelectedProductsAsMessage(_searchNewProducts(5), recipientId)
      break

    case 'QR_DISCOUNTED_PRODUCT':
      _showSelectedProductsAsMessage(_searchDiscountProducts(), recipientId)
      break

    case 'QR_GET_PRODUCT_OPTIONS':
      var shProduct = shopify.product.get(requestPayload.id)
      shProduct.then(function (product) {
        var options = ''
        product.options.map(function (option) {
          options = options + option.name + ': ' + option.values.join(',') + '\n'
        })
        var messageData = {
          recipient: {
            id: recipientId
          },
          message: {
            text: options.substring(0, 640)
          }
        }
        callSendAPI(messageData)
      })
      break

    case 'QR_PRODUCT_SEARCH':
      console.log('search by title:', requestPayload.names)
      _showSelectedProductsAsMessage(_searchByTitle(requestPayload.names), recipientId)
      break

    default:
      text = 'Thank you for shopping with us, may I help you?'
      returnMessageToUser(text)
      break
  }
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation (event) {
  var senderID = event.sender.id // the user who sent the message
  var recipientID = event.recipient.id // the page they sent it from
  var delivery = event.delivery
  var messageIDs = delivery.mids
  var watermark = delivery.watermark
  var sequenceNumber = delivery.seq

  if (messageIDs) {
    messageIDs.forEach(function (messageID) {
      console.log("[receivedDeliveryConfirmation] Message with 'ID' %s was delivered",
        messageID, senderID, recipientID, sequenceNumber)
    })
  }

  console.log("[receivedDeliveryConfirmation] All 'messages' before timestamp %d were delivered.", watermark)
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 *
 */
function receivedPostback (event) {
  var senderID = event.sender.id
  var recipientID = event.recipient.id
  var timeOfPostback = event.timestamp

  if (productsLoaded === false) {
    let products = shopify.product.list({limit: 250})
    products.then(function (listOfProducts) {
      productJson = listOfProducts
      productsLoaded = true
      _searchDiscountProducts()
      _searchNewProducts(10)
    })
  }

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload

  console.log('[receivedPostback] from user (%d) on page (%d) with payload (\'%s\') ' + 'at (%d)',
  senderID, recipientID, payload, timeOfPostback)

  respondToHelpRequestWithTemplates(senderID, payload)
}

function _searchDiscountProducts () {
  var discountedProducts = []
  // console.log('productJson', productJson.length);
  productJson.forEach(function (product) {
    if (product.variants[0].compare_at_price !== null) {
      discountedProducts.push(product)
    }
  })
  // console.log('_searchDiscountProducts', discountedProducts);
  return discountedProducts
}

function _searchByTitle (keyword) {
  var products = []
  let effectiveKeyword = []
  let keywords = keyword.split(' ')
  if (keywords.length > 1) {
    keywords.forEach(function (word) {
      productJson.forEach(function (product) {
        if (product.title.toUpperCase().includes(word.toUpperCase())) {
          products.push(product)
          if (effectiveKeyword.indexOf(word) < 0) {
            effectiveKeyword.push(word)
          }
        }
      })
    })
  } else {
    effectiveKeyword[0] = keyword
    productJson.forEach(function (product) {
      if (product.title.toUpperCase().includes(keyword.toUpperCase())) {
        products.push(product)
      }
    })
  }

  if (products.length > 0) {
    let topItemString = products.length > 5 ? 'Top 5' : 'all of them'
    let messageForSearch = `We have ${products.length} items for your "${effectiveKeyword.join(' ')}" and I show you ${topItemString}.`
    returnMessageToUser(messageForSearch)
  }
  console.log('_searchByTitle', products)
  return products.slice(0, 5)
}

function _searchNewProducts (count) {
  // sort the list by created date desc
  productJson.sort(function (a, b) {
    a = new Date(a.created_at)
    b = new Date(b.created_at)
    return a > b ? -1 : a < b ? 1 : 0
  })
  // console.log('_searchNewProducts', productJson.slice(0, count));
  return productJson.slice(0, count)
}

/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage (recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText, // utf-8, 640-character max
      metadata: 'DEVELOPER_DEFINED_METADATA'
    }
  }

  callSendAPI(messageData)
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI (messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: FB_PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode && response.statusCode === 200) {
      var recipientId = body.recipient_id
      var messageId = body.message_id

      if (messageId) {
        console.log("[callSendAPI] Successfully sent 'message' with id %s to recipient %s", messageId, recipientId)
      } else {
        console.log("[callSendAPI] Successfully called 'Send API' for recipient %s", recipientId)
      }
    } else {
      console.error("[callSendAPI] Send API call 'failed'", response.statusCode, response.statusMessage, body.error)
    }
  })
}

/*
 * Send profile info. This will setup the bot with a greeting and a Get Started button
 */
function callSendProfile () {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messenger_profile',
    qs: { access_token: FB_PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: {
      greeting: [
        {
          locale: 'default',
          text: `Hi? I am Bonnie. Your personal shooper. I will help you shopping. To get started, click the "Get Started" button or type "help" any time.`
        }
      ],
      get_started: {
        payload: JSON.stringify({action: 'GET_STARTED'})
      },
      whitelisted_domains: [
        HOST_URL
      ]
    }
  }, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      console.log("[callSendProfile]:'' ", body)
      var result = body.result
      if (result === 'success') {
        console.log("[callSendProfile] 'Successfully' sent profile.")
      } else {
        console.error("[callSendProfile] There was an 'error' sending profile.")
      }
    } else {
      console.error("[callSendProfile] Send profile call 'failed'", response.statusCode, response.statusMessage, body.error)
    }
  })
}

function _sendMessageWithButtons (recipientId, text, sectionButtonArray) {
  console.log("[sendHelpOptionsAsButtonTemplates] Sending the 'help options' menu")
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: text,
          buttons: sectionButtonArray
        }
      }
    }
  }

  callSendAPI(messageData)
}

function _getGreetings () {
  var date = Date()
  var hour = date.substring(16, 18)
  var timeGreeting = 'Hi,'
  if (hour < 12) {
    timeGreeting = 'Good morning!'
  } else if (hour >= 12 && hour < 18) {
    timeGreeting = 'Good afternoon!'
  } else if (hour >= 18 && hour < 23) {
    timeGreeting = 'Good evening!'
  }
  return timeGreeting
}

/*
 * Start server
 * Webhooks must be available via SSL with a certificate signed by a valid
 * certificate authority.
 */
app.listen(app.get('port'), function () {
  console.log('[app.listen] Node app is running on port', app.get('port'))
  callSendProfile()
})

module.exports = app
