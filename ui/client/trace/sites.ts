/**
 * ZJU Core 的模块各对着哪个网站，「执行过程」里显示用。
 * 不访问网站的模块（profile 看本地档案、doc 读文档）不在里面，算本地操作；
 * commands.test.mjs 核对除此之外的模块都有名字。
 */
export const MODULE_SITES: Readonly<Record<string, string | undefined>> = {
  zjuam: '统一身份认证',
  webvpn: 'WebVPN',
  zdbk: '教务网',
  xuezai: '学在浙大',
  pta: 'PTA',
  lab: '大物实验课',
  notice: '校园通知',
  sztz: '素质拓展平台',
  tyys: '体育场馆',
  zhiyun: '智云课堂',
  chaoxing: '超星学习通',
  ebook: '图书馆电子书',
  cnki: '中国知网',
  cc98: 'CC98',
  chalaoshi: '查老师',
}
