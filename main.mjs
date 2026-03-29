import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { setTimeout } from 'node:timers/promises'

puppeteer.use(StealthPlugin())

const args = [
    '--no-sandbox', 
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled'
]

if (process.env.PROXY_SERVER) {
    const proxy_url = new URL(process.env.PROXY_SERVER)
    proxy_url.username = ''
    proxy_url.password = ''
    args.push(`--proxy-server=${proxy_url}`.replace(/\/$/, ''))
}

const browser = await puppeteer.launch({
    defaultViewport: { width: 1080, height: 1024 },
    args,
})
const [page] = await browser.pages()

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
await page.setUserAgent(userAgent)

const recorder = await page.screencast({ path: 'recording.webm' })

try {
    if (process.env.PROXY_SERVER) {
        const { username, password } = new URL(process.env.PROXY_SERVER)
        if (username && password) {
            await page.authenticate({ username, password })
        }
    }

    await page.goto('https://secure.xserver.ne.jp/xapanel/login/xvps/', { waitUntil: 'networkidle2' })
    await page.locator('#memberid').fill(process.env.EMAIL)
    await page.locator('#user_password').fill(process.env.PASSWORD)
    await page.locator('text=ログインする').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })

    try {
        const closeBtn = await page.waitForSelector('button.modal__close', { timeout: 3000 })
        if (closeBtn) {
            await closeBtn.click()
            await setTimeout(1000)
        }
    } catch (e) {
    }

    await page.locator('a[href^="/xapanel/xvps/server/detail?id="]').click()
    await page.locator('text=更新する').click()
    await page.locator('text=引き続き無料VPSの利用を継続する').click()
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    
    const body = await page.$eval('img[src^="data:"]', img => img.src)
    const code = await fetch('https://captcha-120546510085.asia-northeast1.run.app', { method: 'POST', body }).then(r => r.text())
    await page.locator('[placeholder="上の画像の数字を入力"]').fill(code)

    try {
        await page.waitForSelector('iframe[src*="challenges.cloudflare.com"]', { timeout: 10000 })
        const frames = page.frames()
        const turnstileFrame = frames.find(f => f.url().includes('challenges.cloudflare.com'))

        if (turnstileFrame) {
            const checkbox = await turnstileFrame.waitForSelector('input[type="checkbox"]', { timeout: 5000 })
            if (checkbox) {
                const box = await checkbox.boundingBox()
                if (box) {
                    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
                }
            }
        }

        await page.waitForFunction(() => {
            const input = document.querySelector('[name="cf-turnstile-response"]')
            return input && input.value.length > 0
        }, { timeout: 30000 })
        await setTimeout(1000)
        
    } catch (e) {
    }

    await page.locator('text=無料VPSの利用を継続する').click()
} catch (e) {
    console.error(e)
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
