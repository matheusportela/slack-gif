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
  console.log(`converting video ${input} to gif ${output}`)
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

const requestFileInfo = (fileId, func) => {
  console.log(`requesting file ${fileId} info`)
  const query = querystring.stringify({
    token: process.env.SLACK_AUTH_TOKEN,
    file: fileId
  })
  request.get(`https://slack.com/api/files.info?${query}`, (error, res, body) => {
    json = JSON.parse(body)
    const file = json.file

    console.log(json)

    func(file)
  })
}

const download = (url, output, func) => {
  console.log(`downloading file ${url} to ${output}`)
  const file = fs.createWriteStream(output)

  const sendReq = request.get(url, {
    auth: {
      bearer: process.env.SLACK_AUTH_TOKEN
    }
  })

  sendReq.on('response', (res) => {
    if (res.statusCode !== 200) {
      return func(`response status: ${res.statusCode}`)
    }

    res.pipe(file)
  })

  file.on('finish', () => file.close(func))

  sendReq.on('error', (err) => {
    fs.unlink(output)
    return func(err.message)
  })

  file.on('error', (err) => {
    fs.unlink(output)
    return func(err.message)
  })
}

const upload = (filename) => {
  console.log(`uploading file ${filename}`)
  request
    .post({
      url: 'https://slack.com/api/files.upload',
      formData: {
        token: process.env.SLACK_AUTH_TOKEN,
        file: fs.createReadStream(filename),
        filename: filename,
        channels: '#general',
      }
    }, (err, res, body) => {
      if (err) {
        console.log('error when uploading', err)
      } else {
        console.log('finished upload')
      }
    })
}

const event_callbacks = {
  file_created: (data) => {
    requestFileInfo(data.event.file_id, (file) => {
      console.log(file)

      if (file.filetype === 'mp4') {
        console.log('downloading file')
        const videoFilename = 'video.mp4'
        const gifFilename = 'video.gif'
        download(file.url_private, videoFilename, () => {
          convertVideo(videoFilename, gifFilename, () => {
            upload(gifFilename)
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
    console.log(`Received event ${data.event.type}`)
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
  console.log(`Received event ${data.type}`)
  const callback = global_callbacks[data.type]
  if (callback) {
    const response = callback(data)
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