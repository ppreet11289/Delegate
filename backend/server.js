const express = require('express')
const cors = require('cors')
const session = require('express-session')
const { auth, requiresAuth } = require('express-openid-connect')
require('dotenv').config()
const Groq = require('groq-sdk')
const axios = require('axios')

const app = express()
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }))
app.use(express.json())

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}))

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.SESSION_SECRET,
  baseURL: 'http://localhost:3001',
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  authorizationParams: {
    response_type: 'code',
    scope: 'openid profile email',
  },
  routes: {
    callback: '/callback',
    postLogoutRedirect: process.env.FRONTEND_URL
  },
  afterCallback: (req, res, session) => {
    res.redirect(process.env.FRONTEND_URL)
    return session
  }
}

app.use(auth(config))

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Get Auth0 Management API token
async function getManagementToken() {
  const response = await axios.post(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
    grant_type: 'client_credentials',
    client_id: process.env.AUTH0_CLIENT_ID,
    client_secret: process.env.AUTH0_CLIENT_SECRET,
    audience: process.env.AUTH0_AUDIENCE
  })
  return response.data.access_token
}

// Fetch Gmail token from Token Vault
async function getGmailToken(userId) {
  try {
    const mgmtToken = await getManagementToken()
    const response = await axios.get(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${userId}/credentials`,
      { headers: { Authorization: `Bearer ${mgmtToken}` } }
    )
    const googleCred = response.data.find(c => c.connection === 'google-oauth2')
    if (!googleCred) return null
    return googleCred.access_token
  } catch (error) {
    console.error('Token Vault error:', error.response?.data || error.message)
    return null
  }
}

// Fetch real emails from Gmail
async function getEmails(gmailToken) {
  try {
    const listRes = await axios.get(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread',
      { headers: { Authorization: `Bearer ${gmailToken}` } }
    )
    const messages = listRes.data.messages || []
    const emails = await Promise.all(messages.map(async (msg) => {
      const msgRes = await axios.get(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${gmailToken}` } }
      )
      const headers = msgRes.data.payload.headers
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No subject'
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown'
      return `From: ${from} | Subject: ${subject}`
    }))
    return emails
  } catch (error) {
    console.error('Gmail error:', error.response?.data || error.message)
    return []
  }
}

app.get('/', (req, res) => {
  res.send('Delegate backend is running!')
})

app.get('/login', (req, res) => {
  res.oidc.login({ returnTo: process.env.FRONTEND_URL })
})

app.get('/logout', (req, res) => {
  res.oidc.logout({ returnTo: process.env.FRONTEND_URL })
})

app.get('/me', (req, res) => {
  if (req.oidc.isAuthenticated()) {
    res.json({
      loggedIn: true,
      user: {
        name: req.oidc.user.name,
        email: req.oidc.user.email,
        picture: req.oidc.user.picture
      }
    })
  } else {
    res.json({ loggedIn: false })
  }
})

app.post('/command', requiresAuth(), async (req, res) => {
  const { message } = req.body
  const userName = req.oidc.user.name
  const userId = req.oidc.user.sub

  let emailContext = ''

  // Try to fetch real emails from Token Vault
  const gmailToken = await getGmailToken(userId)
  if (gmailToken) {
    const emails = await getEmails(gmailToken)
    if (emails.length > 0) {
      emailContext = `\n\nHere are the user's latest unread emails:\n${emails.join('\n')}`
    }
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are Delegate, an AI chief of staff that manages a user's digital life.
          You are currently helping ${userName}.
          When the user gives you a command, respond in a friendly and concise way.
          If you have real email data, use it in your response.
          Keep responses under 150 words.
          ${emailContext}`
        },
        {
          role: 'user',
          content: message
        }
      ]
    })

    const reply = response.choices[0].message.content
    res.json({ 
      reply,
      gmailConnected: !!gmailToken
    })

  } catch (error) {
    console.error('Groq error:', error)
    res.status(500).json({ reply: 'Something went wrong.' })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})