const express = require('express')
const querystring = require('querystring')
const fileUpload = require('express-fileupload')
const gify = require('gify')

const app = express()
app.use(express.static('.'))
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: 'files'
}))

const port = 3000

convertVideo = (input, output, func) => {
  gify(input, output, (err) => {
    if (err)
      throw err

    if (func)
      func()
  })
}

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