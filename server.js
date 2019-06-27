require('dotenv').config();

const express = require('express')
const bodyParser = require('body-parser');
const request = require('request');
const fs = require('fs')

const querystring = require('querystring')
const fileUpload = require('express-fileupload')
const gify = require('gify')

const app = express()
app.use(express.static('.'))
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: 'files'
}))
app.use(bodyParser.urlencoded({
  extended: true
}))
app.use(bodyParser.json())

const port = process.env.PORT || 3000

convertVideo = (input, output, func) => {
  opts = {
    width: 50,
    height: 50,
    delay: 0.2,
  }
  gify(input, output, (err) => {
    if (err)
      throw err

    if (func)
      func()
  })
}

app.post('/', (req, res) => {
  var data = {
    form: {
      token: process.env.SLACK_AUTH_TOKEN,
      channel: '#general',
      text: 'Hi! :wave:'
    }
  }
  request.post('https://slack.com/api/chat.postMessage', data, (error, res, body) => {
    res.send('testing')
  })
})

const download = (url, output, callback) => {
  console.log(url)
  const file = fs.createWriteStream(output)

  const sendReq = request.get(url, {
    auth: {
      bearer: process.env.SLACK_AUTH_TOKEN
    }
  })

  sendReq.on('response', (res) => {
    if (res.statusCode !== 200) {
      return callback(`response status: ${res.statusCode}`)
    }

    res.pipe(file)
  })

  file.on('finish', () => file.close(callback))

  sendReq.on('error', (err) => {
    fs.unlink(output)
    return callback(err.message)
  })

  file.on('error', (err) => {
    fs.unlink(output)
    return callback(err.message)
  })
}

const event_callbacks = {
  file_created: (data) => {
    console.log('received file')
    console.log(data)
    const query = querystring.stringify({
      token: process.env.SLACK_AUTH_TOKEN,
      file: data.event.file_id
    })
    console.log('requesting info')
    request.get(`https://slack.com/api/files.info?${query}`, (error, res, body) => {
      json = JSON.parse(body)
      const file = json.file

      console.log(json)
      console.log(file)
      if (file.filetype === 'mp4') {
        const videoFilename = 'video.mp4'
        const gifFilename = 'video.gif'
        console.log('downloading file')
        download(file.url_private, videoFilename, () => {
          console.log('finished downloading')
          convertVideo(videoFilename, gifFilename, () => {
            console.log('finish converting')

            console.log('uploading file')
            var data = {
              form: {
                token: process.env.SLACK_AUTH_TOKEN,
                channel: '#general',
                // file: gifFilename
              }
            }
            request
              .post({
                url: 'https://slack.com/api/files.upload',
                formData: {
                  file: fs.createReadStream(gifFilename),
                  filename: gifFilename,
                  token: process.env.SLACK_AUTH_TOKEN,
                  channels: '#general',
                }
              }, (err, res, body) => {
                if (err) {
                  console.log('error when uploading', err)
                } else {
                  console.log('finished upload')
                }
              })
          })
        })
      } else {
        console.log('skipping download... not mp4')
      }
    })
  }
}

const global_callbacks = {
  url_verification: (data) => data.challenge,
  event_callback: (data) => {
    const callback = event_callbacks[data.event.type]
    if (callback) {
      return callback(data)
    } else {
      return null
    }
  },
}

app.post('/slack-event', (req, res) => {
  const data = req.body
  const callback = global_callbacks[data.type]
  if (callback) {
    const response = callback(data)
    // console.log(response)
    res.send(response)
  } else {
    res.sendStatus(500)
  }
})

app.post('/convert', (req, res) => {
  console.log(req.files)
  const file = req.files.video
  const input = file.tempFilePath
  const output = `${input}.gif`
  convertVideo(input, output, () => {
    // TODO: Passing the file path is a security issue that must be addressed
    const query = querystring.stringify({
      filename: output
    })
    res.redirect(`/gif?${query}`)
  })
})

app.get('/gif', (req, res) => {
  // TODO: Get the file path is a security issue that must be addressed
  res.send(`<img src=${req.query.filename}></img>`)
})

app.listen(port, () => {
  console.log(`slack-gif server listening on port ${port}`)
})