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

console.log("[Info] 数字入力後、40秒待機します...")
    await setTimeout(40000)

    try {
        console.log("[Info] Turnstileの外枠を探します...")
        const turnstileWrapper = await page.waitForSelector('.cf-turnstile', { visible: true, timeout: 10000 })
        
        if (turnstileWrapper) {
            const box = await turnstileWrapper.boundingBox()
            
            if (box) {
                console.log(`[Debug] Wrapper BoundingBox - X: ${box.x}, Y: ${box.y}, Width: ${box.width}, Height: ${box.height}`)
                
                // 1. 外枠の中心を計算
                const wrapperCenterX = box.x + (box.width / 2)
                
                // 2. iframe（幅282px）の左端を計算
                const iframeWidth = 282
                const iframeLeftX = wrapperCenterX - (iframeWidth / 2)
                
                // 3. チェックボックスの正確な座標（左端から約30px、高さは中央）
                const clickX = iframeLeftX + 30
                const clickY = box.y + (box.height / 2)
                
                console.log(`[Debug] iframe左端: ${iframeLeftX}, Target X: ${clickX}, Target Y: ${clickY}`)

                // 人間らしい少しのブレ（±2px程度）を加える
                const finalX = clickX + (Math.random() * 4 - 2)
                const finalY = clickY + (Math.random() * 4 - 2)

                await page.mouse.move(finalX, finalY, { steps: 12 })
                await setTimeout(400 + Math.random() * 200) // マウスを乗せてから少し待つ
                
                // 人間らしいクリック
                await page.mouse.down()
                await setTimeout(80 + Math.random() * 50)  // 押し込み時間
                await page.mouse.up()
                
                console.log("[Info] 計算されたチェックボックス位置をクリックしました")
            } else {
                console.log("[Error] 外枠のboundingBoxが取得できませんでした")
            }
        } else {
            console.log("[Error] 外枠要素が見つかりませんでした")
        }

        console.log("[Info] トークンの取得を待機しています...")
        await page.waitForFunction(() => {
            const input = document.querySelector('[name="cf-turnstile-response"]')
            return input && input.value.length > 0
        }, { timeout: 20000 })
        
        console.log("[Success] Turnstileのトークンを取得しました")
        
    } catch (e) {
        console.log(`[Error] Turnstile処理中に例外発生: ${e.message}`)
    }

    await setTimeout(5000)
    
    await page.locator('text=無料VPSの利用を継続する').click()

} catch (e) {
    console.error(e)
} finally {
    await setTimeout(5000)
    await recorder.stop()
    await browser.close()
}
