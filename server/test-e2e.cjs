const WebSocket = require('ws');

const WS_URL = 'ws://localhost:7880';
const TEST_ROOM = 'test-room-' + Date.now();

function createClient(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const messages = [];
    let device = null;
    let sendTransport = null;
    let recvTransport = null;

    ws.on('open', () => {
      console.log(`[${name}] Connected`);
      ws.send(JSON.stringify({
        type: 'join',
        room: TEST_ROOM,
        display_name: name,
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      messages.push(msg);
      console.log(`[${name}] Received: ${msg.type}`);

      if (msg.type === 'router_capabilities') {
        // Simulate device.load() - just send capabilities back
        ws.send(JSON.stringify({
          type: 'client_rtp_capabilities',
          rtpCapabilities: msg.rtpCapabilities,
        }));
      }

      if (msg.type === 'transport_params') {
        if (msg.direction === 'send') {
          sendTransport = msg;
          // Simulate transport connect
          ws.send(JSON.stringify({
            type: 'connect_transport',
            direction: 'send',
            dtlsParameters: {
              fingerprints: [{ algorithm: 'sha-256', value: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99' }],
              role: 'auto',
            },
          }));
        } else {
          recvTransport = msg;
          ws.send(JSON.stringify({
            type: 'connect_transport',
            direction: 'recv',
            dtlsParameters: {
              fingerprints: [{ algorithm: 'sha-256', value: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99' }],
              role: 'auto',
            },
          }));
        }
      }

      if (msg.type === 'joined') {
        // Simulate producing audio after joining
        if (sendTransport) {
          setTimeout(() => {
            console.log(`[${name}] Sending produce...`);
            ws.send(JSON.stringify({
              type: 'produce',
              kind: 'audio',
              rtpParameters: {
                codecs: [{
                  mimeType: 'audio/opus',
                  payloadType: 111,
                  clockRate: 48000,
                  channels: 2,
                  parameters: { stereo: 1 },
                }],
                headerExtensions: [],
                encodings: [{ ssrc: 12345678 }],
                rtcp: {},
              },
            }));
          }, 500);
        }
      }

      if (msg.type === 'consumer_created') {
        console.log(`[${name}] Consumer created for peer ${msg.peerId}!`);
        // Simulate resume consumer
        ws.send(JSON.stringify({
          type: 'resume_consumer',
          consumerId: msg.consumerId,
        }));
      }
    });

    ws.on('error', (err) => reject(err));

    setTimeout(() => {
      resolve({ ws, messages });
    }, 5000);
  });
}

async function main() {
  console.log('Starting E2E audio test...\n');

  const browserA = await createClient('BrowserA');
  const browserB = await createClient('BrowserB');

  console.log('\n--- Results ---');
  console.log('BrowserA received:', browserA.messages.map(m => m.type));
  console.log('BrowserB received:', browserB.messages.map(m => m.type));

  const aGotConsumer = browserA.messages.some(m => m.type === 'consumer_created');
  const bGotConsumer = browserB.messages.some(m => m.type === 'consumer_created');

  console.log('\nBrowserA got consumer_created:', aGotConsumer);
  console.log('BrowserB got consumer_created:', bGotConsumer);

  if (!aGotConsumer || !bGotConsumer) {
    console.log('\n❌ FAIL: Not all peers received consumer_created!');
    process.exit(1);
  }

  console.log('\n✅ PASS: Audio flow working!');
  browserA.ws.close();
  browserB.ws.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
