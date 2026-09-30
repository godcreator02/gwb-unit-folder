import { sourceTrajectory } from '@/lib/source'
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page'
import { getMDXComponents } from '@/components/mdx'
import { notFound } from 'next/navigation'

// 卡页：标题下一行元信息（born-at、type、domain、parent 链到根卡页），再一行回到盘的链接。
// slug 必选：空 slug 是另一个路由组 src/app/(trajectory-disk)/ 里的整页星轨盘，轨迹区没有导读页。
export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const page = sourceTrajectory.getPage(slug)
  if (!page) notFound()

  const { type, domain, parent, ['born-at']: bornAt } = page.data
  const MDX = page.data.body
  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      {bornAt ? (
        <div style={{ fontSize: 13, opacity: 0.7, margin: '-8px 0 4px' }}>
          {String(bornAt)}
          {type ? ` · ${type}` : ''}
          {domain ? ` · ${domain}` : ''}
          {parent && parent.length > 0 ? (
            <>
              {' · 父卡：'}
              {parent.map((id: string, i: number) => (
                <span key={id}>
                  {i > 0 ? '、' : ''}
                  <a href={`/trajectory/${encodeURIComponent(id)}`}>{id}</a>
                </span>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
      <div style={{ fontSize: 13, margin: '0 0 16px' }}>
        <a href="/trajectory">← 回到盘</a>
      </div>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  )
}

// 只出卡，不出空 slug：/trajectory 那个根是星轨盘那条路由
export function generateStaticParams() {
  return sourceTrajectory.generateParams().filter((p) => p.slug.length > 0)
}
