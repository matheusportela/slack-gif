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

const convertVideo = (input, output) => {
  return new Promise((resolve, reject) => {
    console.log(`converting video ${input} to gif ${output}`)
    opts = {
      width: 50,
      height: 50,
      delay: 0.2,
    }
    gify(input, output, (err) => {
      if (err)
        reject(err)

      resolve(output)
    })
  })
}

const requestFileInfo = (fileId) => {
  return new Promise((resolve, reject) => {
    console.log(`requesting file ${fileId} info`)
    const query = querystring.stringify({
      token: process.env.SLACK_AUTH_TOKEN,
      file: fileId
    })
    request.get(`https://slack.com/api/files.info?${query}`, (error, res, body) => {
      if (error) {
        reject(error)
      } else {
        json = JSON.parse(body)
        const file = json.file

        console.log(json)

        resolve(file)
      }
    })
  })
}

const download = (url, output) => {
  return new Promise((resolve, reject) => {
    console.log(`downloading file ${url} to ${output}`)
    const file = fs.createWriteStream(output)

    const sendReq = request.get(url, {
      auth: {
        bearer: process.env.SLACK_AUTH_TOKEN
      }
    })

    sendReq.on('response', (res) => {
      if (res.statusCode !== 200) {
        resolve(output)
      }

      res.pipe(file)
    })

    file.on('finish', () => file.close(() => {
      resolve(output)
    }))

    sendReq.on('error', (err) => {
      fs.unlink(output)
      reject(err.message)
    })

    file.on('error', (err) => {
      fs.unlink(output)
      reject(err.message)
    })
  })
}

const upload = (filename) => {
  return new Promise((resolve, reject) => {
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
          reject(err)
        } else {
          console.log('finished upload')
          resolve()
        }
      })
  })
}

const event_callbacks = {
  file_created: (data) => {
    return new Promise((resolve, reject) => {
      requestFileInfo(data.event.file_id).then((file) => {
        console.log(file)

        if (file.filetype === 'mp4') {
          return file.url_private
        } else {
          console.log('not mp4')
          throw new Error('not mp4')
        }
      }).then((url) => {
        console.log('downloading file')
        const videoFilename = 'video.mp4'
        return download(url, videoFilename)
      }, (err) => {
        console.log(`skipping download: ${err}`)
        throw new Error()
      }).then((videoFilename) => {
        const gifFilename = 'video.gif'
        return convertVideo(videoFilename, gifFilename)
      }, (err) => {
        console.log('not converting video')
        throw new Error()
      }).then((gifFilename) => {
        return upload(gifFilename)
      }, (err) => {
        console.log('not uploading gif')
      })
    })
  }
}

const global_callbacks = {
  url_verification: (data) => data.challenge,
  event_callback: (data) => {
    console.log(`received event ${data.event.type}`)
    const callback = event_callbacks[data.event.type]
    if (callback) {
      return callback(data)
        .then((result) => {
          console.log(`successfully processed event ${data.event.type}`)
          console.log(result)
        }, (err) => {
          console.log(`failed to process event ${data.event.type}`)
        })
    } else {
      return null
    }
  },
}

app.post('/slack-event', (req, res) => {
  const data = req.body
  console.log(`received event ${data.type}`)
  const callback = global_callbacks[data.type]
  if (callback) {
    const response = callback(data)
    res.send(response)
  } else {
    console.log(`unknown event ${data.type}`)
    res.sendStatus(500)
  }
})

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