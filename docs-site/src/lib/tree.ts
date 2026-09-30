/**
 * 三个区合成一棵侧栏树：每区一个 `root: true` 的根节点（侧栏里的分区），地址仍是三个前缀
 * （/docs、/trajectory、/future，路由各用各的 loader）。
 * base-ui 版的 Root 只有一个 fallback 位置，多棵树切换不稳，所以用根节点分区。
 * 区内的顺序由各区 content/<区>/meta.json 定。
 */
import { source, sourceFuture, sourceTrajectory } from './source'
import type { Node, Root } from 'fumadocs-core/page-tree'

/**
 * 每个区必须带唯一的 $id：fumadocs 给侧栏的区切换下拉找「这个根节点对应哪个选项」时，除了比对象本身还比 $id，
 * 手工拼的节点都没有 $id 的话 undefined === undefined 成立，三个区都会对上第一个选项，下拉里的名字和链接就乱了
 */
function zone(id: string, name: string, root: Root): Node {
  return { $id: `zone:${id}`, type: 'folder', name, root: true, defaultOpen: true, children: root.children }
}

export function zoneTree(): Root {
  return {
    name: 'gwb-unit-folder',
    children: [
      zone('docs', '现状', source.getPageTree()),
      zone('future', '未来', sourceFuture.getPageTree()),
      zone('trajectory', '轨迹', sourceTrajectory.getPageTree()),
    ],
  }
}
