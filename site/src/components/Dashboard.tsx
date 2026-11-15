import { navigateBack } from '../lib/scroll'
import Button from './ui/Button'
import { IconArrowLeft } from './Icons'
import Footer from './Footer'

export default function Dashboard() {
  return (
    <div data-lenis-prevent className="fixed inset-0 z-10 overflow-y-auto overscroll-contain bg-bg">
      <div className="shell pb-24 pt-28">
        <Button variant="glass" size="default" onClick={navigateBack}>
          <IconArrowLeft size={16} /> Back to Overview
        </Button>
      </div>
      <Footer />
    </div>
  )
}
