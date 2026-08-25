import { syncAll } from '../src/lib/social/sync'

syncAll()
  .then((report) => console.log(JSON.stringify(report, null, 2)))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
