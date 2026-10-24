/* ═══════════════════════════════════════════════════════════════
   REGRET OS v2.4.1 — Decision Engine (offline demo core)
   No backend. No network. Only judgement.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ── boot time base ─────────────────────────────────────────── */
  var BOOT_AT = Date.now();
  var BOOT_DATE = new Date(BOOT_AT);

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtTime(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtUptime(ms) {
    var s = Math.floor(ms / 1000);
    return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60);
  }
  function fmtTs(d) { return fmtDate(d) + ' ' + fmtTime(d); }

  /* ── deterministic rng ──────────────────────────────────────── */
  function hashStr(str) {
    var h = 5381;
    str = str.toLowerCase().replace(/\s+/g, ' ').trim();
    for (var i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr, n) {
    var copy = arr.slice(), out = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
    return out;
  }
  function between(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

  /* ── 黑历史 archive (seed data — complete & demo-ready) ─────── */
  var ARCHIVE_BASE = 1247;               // claimed total; list shows recent
  var ARCHIVE = [
    { id: 451, ts: '2019-06-12 02:47', text: '凌晨两点给前任发了「在吗」，对方已读不回', outcome: 'REGRETTED', cat: 'love' },
    { id: 508, ts: '2019-09-01 20:30', text: '年会上唱《爱情买卖》，麦克风还关不掉', outcome: 'REGRETTED', cat: 'social' },
    { id: 623, ts: '2020-03-18 15:02', text: '跟风梭哈某币，山顶站岗至今', outcome: 'REGRETTED', cat: 'money' },
    { id: 704, ts: '2020-07-05 11:20', text: '朋友圈发「今天也是元气满满的一天」，被截图做成表情包', outcome: 'REGRETTED', cat: 'social' },
    { id: 788, ts: '2021-01-24 23:58', text: '跨年夜发了 999 字长文，只设置了「仅自己可见」', outcome: 'NEUTRAL', cat: 'social' },
    { id: 812, ts: '2021-05-30 18:40', text: '对客服说「你赔得起吗」，第二天道歉的是我', outcome: 'REGRETTED', cat: 'social' },
    { id: 899, ts: '2021-11-11 00:05', text: '拒绝了大厂内推，说要去「追寻热爱」，热爱没追到', outcome: 'NEUTRAL', cat: 'career' },
    { id: 941, ts: '2022-02-14 21:10', text: '在所有人面前单膝跪地掏戒指，掏出来的是耳机盒', outcome: 'REGRETTED', cat: 'love' },
    { id: 1007, ts: '2022-08-08 09:00', text: '办了健身年卡，共使用 2 次（其中 1 次是去洗澡）', outcome: 'REGRETTED', cat: 'life' },
    { id: 1089, ts: '2023-03-21 14:12', text: '裸辞信写得慷慨激昂，三个月后简历写得低声下气', outcome: 'REGRETTED', cat: 'career' },
    { id: 1155, ts: '2023-10-01 16:44', text: '卸载游戏第 7 次，这次坚持了整整一周', outcome: 'PROUD', cat: 'life' },
    { id: 1201, ts: '2024-04-19 12:30', text: '第一次当众演讲没跑，站在台上没跑（只是腿在跑）', outcome: 'PROUD', cat: 'career' }
  ];
  var sessionAdds = [];
  var sessionDecisions = [];

  function archiveCount() { return ARCHIVE_BASE + sessionAdds.length; }
  function fmtCount(n) { return n.toLocaleString('en-US'); }

  /* ── decision categories (zh + en keywords) ─────────────────── */
  var CATEGORIES = [
    {
      id: 'career', context: 'CAREER', horizon: '12 MONTHS',
      keys: ['quit', 'job', 'resign', 'startup', 'business', 'offer', '辞职', '裸辞', '跳槽', '创业', '上班', '内卷', '考公', '读研', '副业', '转行', '加班', '老板'],
      risks: [
        '收入断崖风险（6–12 个月缓冲期不足）',
        '社保/医保空窗，一场病回到解放前',
        '简历上的空窗期会被 HR 反复盘问',
        '新方向的「热爱」可能只是对现状的逃避',
        '冲动决策历史命中率 71%（archive 佐证）',
        '家庭会议风险：妈妈的叹气会持续数月'
      ],
      alts: [
        '先用 3–6 个月做副业验证，再谈全身而退',
        '攒够 18 个月生活费再启动「逃跑计划」',
        '请假一周模拟新生活，成本几乎为零',
        '找 3 个已经走过这条路的人聊完再决定',
        '写下辞职信，压 72 小时再决定发不发',
        '把「离开的原因」写成清单，逐条能不能被钱解决'
      ],
      verdicts: {
        no: {
          text: 'NOT RECOMMENDED (FOR NOW)',
          blurb: '档案显示：你在情绪峰值做决定的历史命中率感人。先把新方向跑成「有数据的选项」，再谈离开。逃跑可以，别蒙着眼跑。',
          label: 'PRELIMINARY RESULT'
        },
        yes: {
          text: 'RECOMMENDED (WITH EXIT PLAN)',
          blurb: '引擎认可这次冲动的成色——它有想法、有铺垫、还知道来问一嘴。批准执行，但必须带着 6 个月缓冲金和一份止损线。',
          label: 'FINAL RESULT'
        },
        caution: {
          text: 'PROCEED WITH CAUTION',
          blurb: '可以动，但别梭哈。档案里有两条「战略性撤退」的成功记录，照着抄作业：先业余跑通，再谈全职。给自己留一个能回去的位置。',
          label: 'PRELIMINARY RESULT'
        },
        meh: {
          text: 'INSUFFICIENT DATA — GO WITH GUT',
          blurb: '问题问得太模糊，引擎无法从 1,247 条黑历史中找到可对标的先例。好消息：反正也没人能替你扛，跟随直觉，记得复盘。',
          label: 'INCONCLUSIVE'
        }
      }
    },
    {
      id: 'love', context: 'LOVE', horizon: '6 MONTHS',
      keys: ['love', 'crush', 'confess', 'date', 'girlfriend', 'boyfriend', 'marry', 'breakup', 'ex', '表白', '喜欢', '恋爱', '前任', '分手', '结婚', '暧昧', '复合', '暗恋', '相亲', '约会', '求婚'],
      risks: [
        '「TA 也喜欢你」置信区间：薛定谔状态',
        '被拒后的社交半径会强制收缩',
        '凌晨决策模式：archive #0451 案底在册',
        '把感动误判为心动的前科 ×3',
        '朋友圈公开后的撤回成本极高',
        '复合成功率统计学上不支持乐观'
      ],
      alts: [
        '先制造一次低风险的单独见面再摊牌',
        '把想说的话发给树洞小号，24 小时后再决定',
        '向共同好友轻探口风，成本低于当面社死',
        '写一封不会寄出的信，理清自己真正想要什么',
        '把「表白」拆成三次渐进试探，而非一次豪赌',
        '先提升自己三个月，吸引力是最低风险的策略'
      ],
      verdicts: {
        no: {
          text: 'DO NOT SEND (YET)',
          blurb: '引擎扫描到多条「深夜冲动发送」的前科。如果这条消息的发送时间在 23:00–05:00 之间，建议直接入睡。醒来还想发，再来问。',
          label: 'PRELIMINARY RESULT'
        },
        yes: {
          text: 'RECOMMENDED (GO FOR IT)',
          blurb: '暗恋的折旧率是所有资产里最高的。档案显示你最大的遗憾从不是「试过失败」，而是「没试过」。白天去说，带上体面。',
          label: 'FINAL RESULT'
        },
        caution: {
          text: 'PROCEED WITH CAUTION',
          blurb: '感情可以冲，流程不能省。先确认对方的信号不是你自己脑补的滤镜，再安排一次自然的独处。冲动是燃料，不是方向盘。',
          label: 'PRELIMINARY RESULT'
        },
        meh: {
          text: 'INSUFFICIENT DATA — GO WITH GUT',
          blurb: '关于人心，1,247 条黑历史的样本量依然不够。引擎摊手。唯一确定的是：不做选择也是一种选择，而且通常是最贵的那种。',
          label: 'INCONCLUSIVE'
        }
      }
    },
    {
      id: 'money', context: 'FINANCE', horizon: '24 MONTHS',
      keys: ['invest', 'stock', 'bitcoin', 'crypto', 'buy', 'fund', '买房', '买车', '股票', '基金', '理财', '比特币', '消费', '花钱', '梭哈', '房价', '贷款', '装修', '奢侈品', '黄金'],
      risks: [
        '梭哈前科：archive #0623 至今未解套',
        'FOMO 情绪下决策错误率 ×2.4',
        '「这次不一样」是史上最贵的一句话',
        '现金流无法覆盖 12 个月月供',
        '把运气赚来的钱，凭实力亏回去的路径已演练过'
      ],
      alts: [
        '先用 5% 仓位试水，设好止损线再谈加仓',
        '定投代替梭哈，用时间稀释冲动',
        '把目标拆成「先攒到 X 万再说」的硬门槛',
        '等待 72 小时冷静期，冲动购买意愿会衰减 60%',
        '咨询一个会泼你冷水的朋友，而非只会点头的',
        '写下「最坏结果我能承受吗」，写不出来就是不能'
      ],
      verdicts: {
        no: {
          text: 'NOT RECOMMENDED',
          blurb: '引擎在档案里闻到了熟悉的 FOMO 味道。你的钱包上一次这么兴奋的时候，回撤了 43%。钱可以再生，本金没了就只剩段子。',
          label: 'PRELIMINARY RESULT'
        },
        yes: {
          text: 'RECOMMENDED (SIZED DOWN)',
          blurb: '这次的逻辑链罕见地完整：有依据、有耐心、有止损。批准执行，但仓位按引擎给的上限来——冲动的人需要外部限速器。',
          label: 'FINAL RESULT'
        },
        caution: {
          text: 'PROCEED WITH CAUTION',
          blurb: '方向也许没错，节奏全错。分批建仓，设置机械止损，不看盘超过每天一次。让规则替你管手，档案替你记仇。',
          label: 'PRELIMINARY RESULT'
        },
        meh: {
          text: 'INSUFFICIENT DATA — GO WITH GUT',
          blurb: '问题缺少金额、周期和风险偏好的关键参数。引擎只能给祖传建议：不懂的东西不碰，碰了的东西别重仓。',
          label: 'INCONCLUSIVE'
        }
      }
    },
    {
      id: 'social', context: 'SOCIAL', horizon: '48 HOURS',
      keys: ['朋友圈', 'moments', 'post', 'tweet', '道歉', 'apologize', 'sorry', '微博', '删', '发帖', '社死', '公开', '回应', '回怼', '撕', '评论', '截图', 'emo', '发文'],
      risks: [
        '发出后 30 分钟内被截图传播的概率 68%',
        '「撤回」功能给人的勇气是虚假的',
        '深夜发布置信度校准失败前科 ×4',
        '评论区的走向从来不在你的剧本里',
        '对面截图留存癖：比你的记忆力好'
      ],
      alts: [
        '先发给信任的 1 个人过目，再决定发不发',
        '把长文折叠成三句话，杀伤力不变，风险减半',
        '道歉用私聊，公开姿态留给必要的体面',
        '等 24 小时，让「想发的冲动」先死一遍',
        '写完先存草稿箱——那是世界上最安全的地方',
        '问自己：三年后回头看，这条还重要吗'
      ],
      verdicts: {
        no: {
          text: 'DO NOT POST',
          blurb: '引擎检测到「已编辑 14 次的文案」。这代表情绪浓度已超出安全阈值。关掉输入框，去洗个澡，档案会替你记住这份勇气曾来过。',
          label: 'PRELIMINARY RESULT'
        },
        yes: {
          text: 'RECOMMENDED (POST IT)',
          blurb: '这条内容情绪稳定、逻辑清晰、杀伤力可控。档案支持你此刻的表达欲——人不能永远做情绪稳定的标本。',
          label: 'FINAL RESULT'
        },
        caution: {
          text: 'PROCEED WITH CAUTION',
          blurb: '可以发，但要「去火力化」：删掉三处暗讽、保留事实、移除收件人点名。表达是权利，拱火是艺术，你目前更擅长后者。',
          label: 'PRELIMINARY RESULT'
        },
        meh: {
          text: 'INSUFFICIENT DATA — GO WITH GUT',
          blurb: '文案内容不足以判断烈度。引擎的底线建议只有一条：别在酒后、别在凌晨、别@具体的人。',
          label: 'INCONCLUSIVE'
        }
      }
    },
    {
      id: 'life', context: 'LIFE', horizon: '12 MONTHS',
      keys: ['move', 'city', 'travel', '移民', '出国', '考研', '换城市', '旅行', '搬家', '留学', '躺平', '休息', 'gap', '离职', '减肥', '早睡', '健身', '学', '转行', '重新开始'],
      risks: [
        '新鲜感衰减周期通常只有 90 天',
        '「换个环境重启人生」的迁移成本被低估 2–3 倍',
        '旧问题会跟着搬家，行李箱装不下但大脑装得下',
        '财务缓冲不足时，远方只剩生存模式',
        '半途放弃前科：archive 多条 PROUD 未遂'
      ],
      alts: [
        '先用一次两周的长旅行代替永久迁移',
        '给自己 90 天试点期，设好回滚方案',
        '把目标拆成本月可执行的最小一步',
        '算一笔账：迁移成本 ÷ 预期收益 < 3 就再等等',
        '找一个已经在那边生活的人聊真实日常',
        '在当前城市先复刻那种生活的一角'
      ],
      verdicts: {
        no: {
          text: 'NOT RECOMMENDED (YET)',
          blurb: '引擎闻到了「重启幻想」的味道。换地图救不了没练级的玩家。先在当前关卡把关键任务清了，传送门才会真正通向新世界。',
          label: 'PRELIMINARY RESULT'
        },
        yes: {
          text: 'RECOMMENDED (WITH A TRIAL)',
          blurb: '这次不是逃跑，是转移阵地——档案分得清这两者。批准试行 90 天，设好回滚点。人生可以有分支，但要有存档。',
          label: 'FINAL RESULT'
        },
        caution: {
          text: 'PROCEED WITH CAUTION',
          blurb: '计划方向成立，细节全是坑。把「去了之后的前 30 天」逐日排出来，排不出来就说明还没准备好。行动力是想出来的，不是冲出来的。',
          label: 'PRELIMINARY RESULT'
        },
        meh: {
          text: 'INSUFFICIENT DATA — GO WITH GUT',
          blurb: '目标太大、参数太少。引擎建议把问题改写成：「下个月我能为这个决定做的一件最小的事是什么？」然后再来。',
          label: 'INCONCLUSIVE'
        }
      }
    }
  ];

  var GENERAL = {
    id: 'general', context: 'GENERAL', horizon: 'UNDEFINED',
    risks: [
      '问题表述模糊，决策模型置信度天然受限',
      '你在信息不全时决策的历史胜率：感人',
      '情绪、疲劳、饥饿是三大决策污染源',
      '「来都来了」式沉没成本陷阱检测到 2 处',
      '把「想知道答案」误当成「已经下决心」'
    ],
    alts: [
      '把问题改写成「是/否」再问一次，精度翻倍',
      '给每个选项写一行「最坏我能接受到什么程度」',
      '设置一个决策截止时间，防止无限期反刍',
      '问一个局外人，答案不重要，听你复述时的语气才重要',
      '把决定拆成可逆的小步，而不是一次性豪赌',
      '睡一觉。睡眠是免费的决策增强插件'
    ],
    verdicts: {
      no: {
        text: 'NOT RECOMMENDED (FOR NOW)',
        blurb: '综合 1,247 条档案记录，你的「直觉」在焦虑状态下准确率低于抛硬币。先收集信息，再谈决定。急，是大多数后悔的统一开头。',
        label: 'PRELIMINARY RESULT'
      },
      yes: {
        text: 'RECOMMENDED',
        blurb: '这次引擎站在你这边：问题清晰、动机稳定、并且知道来查攻略。批准执行——附赠档案的祝福：别怕，黑历史本来就是这么攒出来的。',
        label: 'FINAL RESULT'
      },
      caution: {
        text: 'PROCEED WITH CAUTION',
        blurb: '可以行动，但把决定拆成三步走，每步设一个「反悔窗口」。你不需要更勇敢，你需要更可逆。',
        label: 'PRELIMINARY RESULT'
      },
      meh: {
        text: 'INSUFFICIENT DATA — GO WITH GUT',
        blurb: '问题太空泛，连黑历史都对不上号。换个问法：把「我该怎么办」换成「我是在 A 和 B 之间选吗」，再回来。',
        label: 'INCONCLUSIVE'
      }
    }
  };

  function detectCategory(q) {
    var s = q.toLowerCase();
    for (var i = 0; i < CATEGORIES.length; i++) {
      var c = CATEGORIES[i];
      for (var j = 0; j < c.keys.length; j++) {
        if (s.indexOf(c.keys[j]) !== -1) return c;
      }
    }
    return GENERAL;
  }

  /* ── boot log data ──────────────────────────────────────────── */
  var BOOT_MSGS = [
    ['Booting Regret OS v2.4.1 ...', '启动系统'],
    ['Initializing kernel modules ...', '初始化内核模块'],
    ['Loading decision-engine core ...', '加载决策核心'],
    ['Mounting knowledge base ...', '挂载知识库（含黑历史 1,247 条）'],
    ['Connecting to local models (llm://offline) ...', '连接本地模型 · 离线运行'],
    ['Loading behavioral heuristics ...', '加载行为启发式规则'],
    ['Initializing risk assessment matrix ...', '初始化风险评估矩阵'],
    ['Calibrating value alignment ...', '校准价值观对齐'],
    ['System ready.', '系统就绪']
  ];

  var ASCII_ART =
    '█▀█ █ █ █▀█ █▀█ █▀▄ █▄█ █▀█ █▀█\n' +
    '█▀█ █▄█ █▀█ █▀█ █▀▄  █  █▀▄ █▀▄';

  var STEP_MSGS = [
    ['Parsing query semantics ...', '解析语义'],
    ['Loading regret archive [{n} entries] ...', '加载黑历史档案'],
    ['Cross-referencing past decisions ...', '交叉比对既往决策'],
    ['Running scenario simulations (10,000 paths) ...', '推演万条路径'],
    ['Checking value alignment ...', '校验价值观'],
    ['Generating recommendation ...', '生成判决']
  ];

  var SYSTEM_LOGS = [
    { t: 0, m: 'kernel: regret-indexer mounted at /dev/memories', k: 'ok' },
    { t: 1, m: 'archive: 1,247 entries checksum verified', k: 'ok' },
    { t: 2, m: 'guard: hopium-injector refused to start (as designed)', k: '' },
    { t: 3, m: 'watchdog: operator heartbeat irregular after 2am', k: 'warn' },
    { t: 4, m: 'model: local-7b loaded, warmth=0.00, judgement=1.00', k: 'ok' },
    { t: 5, m: 'memory: "ex\'s-new-dog.jpg" access blocked by policy', k: 'warn' },
    { t: 6, m: 'engine: value alignment calibrated to sarcasm>=60%', k: '' },
    { t: 7, m: 'sync: moments-2019–2021 re-encrypted with key=therapy', k: 'ok' },
    { t: 8, m: 'audit: 0 regrets were spared today', k: '' },
    { t: 9, m: 'engine: awaiting question. courage subsystem degraded.', k: 'warn' }
  ];

  /* ── DOM refs ───────────────────────────────────────────────── */
  var bootLog = $('#boot-log');
  var asciiEl = $('#ascii-art');
  var clockEl = $('#titlebar-clock');
  var statusClock = $('#status-clock');
  var uptimeEl = $('#uptime');
  var diagUptimeEl = $('#diag-uptime');
  var statCpu = $('#stat-cpu');
  var statRam = $('#stat-ram');
  var statGpu = $('#stat-gpu');
  var statusReady = $('#status-ready');
  var input = $('#cmd-input');
  var form = $('#dock-form');
  var btnClear = $('#btn-clear');
  var queryText = $('#query-text');
  var chipContext = $('#chip-context');
  var chipRisk = $('#chip-risk');
  var chipHorizon = $('#chip-horizon');
  var analysisEl = $('#analysis');
  var stepsEl = $('#steps');
  var progressFill = $('#progress-fill');
  var progressPct = $('#progress-pct');
  var resultEl = $('#result');
  var resultLabel = $('#result-label');
  var resConfidence = $('#res-confidence');
  var resRisk = $('#res-risk');
  var resImpact = $('#res-impact');
  var verdictLine = $('#verdict-line');
  var verdictIcon = $('#verdict-icon');
  var verdictText = $('#verdict-text');
  var verdictBlurb = $('#verdict-blurb');
  var verdictCite = $('#verdict-cite');
  var riskList = $('#risk-list');
  var altList = $('#alt-list');
  var archiveList = $('#archive-list');
  var archiveTotal = $('#archive-total');
  var archiveSession = $('#archive-session');
  var sessionList = $('#session-list');
  var toastStack = $('#toast-stack');
  var logFeed = $('#log-feed');

  /* ── status helpers ─────────────────────────────────────────── */
  function setStatus(mode) {
    statusReady.classList.remove('is-alert', 'is-busy');
    var dot = '<i class="pulse-dot"></i>';
    if (mode === 'busy') { statusReady.classList.add('is-busy'); statusReady.innerHTML = dot + 'ANALYZING'; }
    else if (mode === 'alert') { statusReady.classList.add('is-alert'); statusReady.innerHTML = dot + 'REGRET DETECTED'; }
    else { statusReady.innerHTML = dot + 'READY'; }
  }

  function toast(html, kind) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' is-' + kind : '');
    el.innerHTML = html;
    toastStack.appendChild(el);
    setTimeout(function () { el.remove(); }, 3900);
  }

  /* ── clock / uptime / fake stats ────────────────────────────── */
  function tick() {
    var now = new Date();
    clockEl.textContent = fmtDate(now) + ' ' + fmtTime(now);
    statusClock.textContent = fmtTime(now);
    var up = fmtUptime(Date.now() - BOOT_AT);
    uptimeEl.textContent = up;
    if (diagUptimeEl) diagUptimeEl.textContent = up;
  }
  setInterval(tick, 500); tick();

  setInterval(function () {
    statCpu.textContent = between(Math.random, 6, 26) + '%';
    statRam.textContent = (2.8 + Math.random() * 0.7).toFixed(1) + '/16G';
    statGpu.textContent = (Math.random() < 0.85 ? 0 : between(Math.random, 1, 8)) + '%';
  }, 2200);

  /* ── boot sequence ──────────────────────────────────────────── */
  function bootSequence(done) {
    var base = new Date(BOOT_AT);
    BOOT_MSGS.forEach(function (pair, i) {
      setTimeout(function () {
        var ts = new Date(base.getTime() + Math.floor(i * 0.4 * 1000));
        var line = document.createElement('div');
        line.className = 'boot-line';
        line.innerHTML =
          '<span class="no">' + pad(i + 1) + '</span>' +
          '<span class="ts">[' + fmtTime(ts) + ']</span>' +
          '<span class="msg">' + pair[0] + ' <span class="zh">' + pair[1] + '</span></span>' +
          '<span class="ok">[ OK ]</span>';
        bootLog.appendChild(line);
        if (i === BOOT_MSGS.length - 1 && done) done();
      }, 150 + i * 170);
    });
  }

  function typeAscii(done) {
    var lines = ASCII_ART.split('\n');
    var full = 0;
    var chars = ASCII_ART.length;
    asciiEl.textContent = '';
    var i = 0;
    var timer = setInterval(function () {
      i += 3;
      asciiEl.textContent = ASCII_ART.slice(0, i);
      if (i >= chars) {
        clearInterval(timer);
        asciiEl.textContent = ASCII_ART; // ensure final newline preserved
        if (done) done();
      }
    }, 12);
  }

  /* ── engine execution ───────────────────────────────────────── */
  var runToken = 0;
  var isRunning = false;

  function levelClass(v) {
    v = String(v).toUpperCase();
    if (v === 'HIGH' || v === 'SEVERE' || v === 'SIGNIFICANT') return 'is-high';
    if (v === 'MEDIUM' || v === 'MODERATE') return 'is-medium';
    return 'is-low';
  }

  function decide(query) {
    var cat = detectCategory(query);
    var rng = mulberry32(hashStr(query));
    var roll = rng();
    var verdictKey;
    if (query.length < 8) verdictKey = 'meh';
    else if (roll < 0.34) verdictKey = 'no';
    else if (roll < 0.58) verdictKey = 'yes';
    else if (roll < 0.84) verdictKey = 'caution';
    else verdictKey = 'meh';

    var v = cat.verdicts[verdictKey];
    var confidence = verdictKey === 'meh' ? between(rng, 41, 63) : between(rng, 68, 94);
    var risk = verdictKey === 'yes' ? pick(rng, ['LOW', 'MEDIUM'], 1)[0]
      : verdictKey === 'no' ? pick(rng, ['HIGH', 'SEVERE'], 1)[0]
      : verdictKey === 'caution' ? 'MEDIUM' : pick(rng, ['LOW', 'MEDIUM'], 1)[0];
    var impact = verdictKey === 'no' ? pick(rng, ['SIGNIFICANT', 'SEVERE'], 1)[0]
      : verdictKey === 'yes' ? pick(rng, ['MODERATE', 'SIGNIFICANT'], 1)[0]
      : verdictKey === 'caution' ? 'MODERATE' : pick(rng, ['MINOR', 'MODERATE'], 1)[0];

    // icon + theme class
    var theme = verdictKey === 'yes' ? 'is-green'
      : verdictKey === 'caution' ? 'is-amber'
      : verdictKey === 'meh' ? 'is-neutral' : 'is-red';
    var icon = verdictKey === 'yes' ? '◈' : verdictKey === 'meh' ? '◌' : '⚠';

    // archive citation: prefer same-category record
    var sameCat = ARCHIVE.filter(function (r) { return r.cat === cat.id; });
    var pool = sameCat.length ? sameCat : ARCHIVE;
    var cite = pool[Math.floor(rng() * pool.length)];

    return {
      cat: cat, verdictKey: verdictKey, verdict: v, theme: theme, icon: icon,
      confidence: confidence, risk: risk, impact: impact,
      risks: pick(rng, cat.risks, 3),
      alts: pick(rng, cat.alts, 4),
      cite: cite,
      horizon: cat.horizon, context: cat.context
    };
  }

  function runAnalysis(query) {
    if (isRunning) return;
    isRunning = true;
    var token = ++runToken;
    var result = decide(query);

    // query panel
    queryText.textContent = query;
    chipContext.textContent = result.context;
    chipRisk.textContent = '—';
    chipHorizon.textContent = result.horizon;
    analysisEl.hidden = false;
    stepsEl.innerHTML = '';
    progressFill.style.width = '0%';
    progressPct.textContent = '0%';
    resultEl.hidden = true;
    resultEl.className = 'result';
    setStatus('busy');
    btnClear.disabled = true;

    var n = STEP_MSGS.length;
    var stepEls = [];
    STEP_MSGS.forEach(function (pair, i) {
      var el = document.createElement('div');
      el.className = 'step';
      el.innerHTML = '<span class="step-label">&gt;[' + (i + 1) + '/' + n + '] ' +
        pair[0].replace('{n}', fmtCount(archiveCount())) + ' <span class="zh">' + pair[1] + '</span></span>' +
        '<span class="step-status">[ WAIT ]</span>';
      stepsEl.appendChild(el);
      stepEls.push(el);
    });

    var start = performance.now();
    var DURATION = 3600;
    var raf = function () {
      if (token !== runToken) return;
      var p = Math.min(1, (performance.now() - start) / DURATION);
      var pct = Math.floor(p * 100);
      progressFill.style.width = pct + '%';
      progressPct.textContent = pct + '%';
      var activeIdx = Math.min(n - 1, Math.floor(p * n));
      stepEls.forEach(function (el, i) {
        var status = el.querySelector('.step-status');
        if (i < activeIdx || (p >= 1)) {
          el.className = 'step is-done'; status.textContent = '[ OK ]';
        } else if (i === activeIdx) {
          el.className = 'step is-running'; status.textContent = '[ RUNNING ]';
        }
      });
      if (p < 1) requestAnimationFrame(raf);
      else {
        stepEls.forEach(function (el) { el.className = 'step is-done'; el.querySelector('.step-status').textContent = '[ OK ]'; });
        if (token === runToken) revealResult(query, result);
      }
    };
    requestAnimationFrame(raf);
  }

  function revealResult(query, result) {
    resultLabel.textContent = result.verdict.label;
    var labelZhMap = { no: '暂不推荐', yes: '最终判决', caution: '谨慎推进', meh: '证据不足' };
    var labelZh = document.getElementById('result-label-zh');
    if (labelZh) labelZh.textContent = labelZhMap[result.verdictKey] || '初步判决';
    verdictIcon.textContent = result.icon;
    var verdictZhMap = {
      no: '暂不推荐，先别动手', yes: '推荐执行，带上止损线',
      caution: '谨慎推进，拆小步走', meh: '证据不足，跟随直觉'
    };
    verdictText.innerHTML = escapeHtml(result.verdict.text) +
      ' <span class="zh verdict-zh">' + verdictZhMap[result.verdictKey] + '</span>';
    verdictBlurb.textContent = result.verdict.blurb;
    verdictCite.innerHTML = '↳ archive match: <b>#' + result.cite.id + '</b> 「' + result.cite.text +
      '」 (' + result.cite.ts.slice(0, 10) + ') — outcome: ' + result.cite.outcome;
    resConfidence.textContent = result.confidence + '%';
    resRisk.textContent = result.risk;
    resRisk.className = 'boxed ' + levelClass(result.risk);
    resImpact.textContent = result.impact;
    resImpact.className = 'boxed ' + levelClass(result.impact);
    chipRisk.textContent = result.risk;
    chipRisk.className = 'chip-risk';

    riskList.innerHTML = '';
    result.risks.forEach(function (r, i) {
      var li = document.createElement('li');
      li.style.animationDelay = (i * 60) + 'ms';
      li.innerHTML = '<span class="ico ico--risk">◑</span><span>' + r + '</span>';
      riskList.appendChild(li);
    });
    altList.innerHTML = '';
    result.alts.forEach(function (a, i) {
      var li = document.createElement('li');
      li.style.animationDelay = (i * 60) + 'ms';
      li.innerHTML = '<span class="ico ico--alt">→</span><span>' + a + '</span>';
      altList.appendChild(li);
    });

    resultEl.hidden = false;
    resultEl.className = 'result ' + (result.theme === 'is-red' ? '' : result.theme);
    resultEl.classList.add('glitch-flash');
    setTimeout(function () { resultEl.classList.remove('glitch-flash'); }, 500);

    // session log
    sessionDecisions.unshift({
      ts: fmtTs(new Date()), q: query, v: result.verdict.text, conf: result.confidence
    });
    renderSession();

    // status flash
    setStatus('alert');
    setTimeout(function () {
      if (result.verdictKey === 'no') {
        toast('<span class="toast-cmd">REGRET PREVENTED.</span> 引擎已拦下一次潜在黑历史。档案 +0（潜在）', 'warn');
      } else if (result.verdictKey === 'yes') {
        toast('<span class="toast-cmd">GO SIGN-OFF GIVEN.</span> 去吧。档案等你回来写后续。', '');
      } else {
        toast('<span class="toast-cmd">CAUTION ADVISED.</span> 引擎替你捏了把汗。', 'warn');
      }
      setStatus('ready');
    }, 1600);

    isRunning = false;
    $('#btn-clear').disabled = false;
    setTimeout(function () { resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
  }

  /* ── archive rendering ──────────────────────────────────────── */
  function outcomeClass(o) {
    return o === 'REGRETTED' ? 'is-regretted' : o === 'PROUD' ? 'is-proud' : 'is-neutral';
  }
  function renderArchive() {
    archiveTotal.textContent = fmtCount(archiveCount());
    archiveSession.textContent = String(sessionAdds.length);
    var all = sessionAdds.concat(ARCHIVE);
    archiveList.innerHTML = '';
    all.forEach(function (r, i) {
      var row = document.createElement('div');
      row.className = 'archive-row' + (r.isNew ? ' is-new' : '');
      row.innerHTML =
        '<span class="a-id">#' + r.id + '</span>' +
        '<span class="a-ts">' + r.ts + '</span>' +
        '<span class="a-text">' + escapeHtml(r.text) + '</span>' +
        '<span class="a-out ' + outcomeClass(r.outcome) + '">' + r.outcome + '</span>';
      archiveList.appendChild(row);
    });
  }
  function renderSession() {
    if (!sessionDecisions.length) return;
    sessionList.innerHTML = '';
    sessionDecisions.forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'archive-row';
      row.innerHTML =
        '<span class="a-id">Q' + '</span>' +
        '<span class="a-ts">' + d.ts.slice(11) + '</span>' +
        '<span class="a-text">' + escapeHtml(d.q) + '</span>' +
        '<span class="a-out ' + (d.v.indexOf('NOT') === 0 || d.v.indexOf('DO NOT') === 0 ? 'is-regretted' : d.v.indexOf('RECOMMENDED') === 0 ? 'is-proud' : 'is-neutral') + '">' + d.v + '</span>';
      sessionList.appendChild(row);
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function addRecord(text) {
    var id = ARCHIVE_BASE + sessionAdds.length + 1;
    var rec = {
      id: id, ts: fmtTs(new Date()), text: text,
      outcome: 'UNVERIFIED', cat: detectCategory(text).id, isNew: true
    };
    sessionAdds.unshift(rec);
    renderArchive();
    return rec;
  }

  /* ── system logs view ───────────────────────────────────────── */
  function renderLogs() {
    logFeed.innerHTML = '';
    SYSTEM_LOGS.forEach(function (l, i) {
      var ts = new Date(BOOT_AT + l.t * 1000);
      var row = document.createElement('div');
      row.className = 'log-line' + (l.k ? ' is-' + l.k : '');
      row.innerHTML = '<span class="lt">[' + fmtTime(ts) + ']</span><span class="lm">' + l.m + '</span>';
      logFeed.appendChild(row);
    });
  }

  /* ── navigation ─────────────────────────────────────────────── */
  $$('.nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      cancelAutoplay();
      $$('.nav-item').forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      var view = btn.getAttribute('data-view');
      $$('.view').forEach(function (v) { v.classList.remove('is-active'); });
      var target = $('#view-' + view);
      if (target) target.classList.add('is-active');
      input.focus();
    });
  });

  /* ── commands ───────────────────────────────────────────────── */
  function handleCommand(raw) {
    var q = raw.trim();
    if (!q) return;
    var lower = q.toLowerCase();

    if (lower === 'clear' || lower === 'cls') {
      clearAll(); return;
    }
    if (lower === 'help' || lower === '?') {
      toast('<span class="toast-cmd">help</span> — 这条提示 · <span class="toast-cmd">history</span> — 打开档案 · <span class="toast-cmd">remember &lt;text&gt;</span> — 录入黑历史 · <span class="toast-cmd">stats</span> — 系统状态 · <span class="toast-cmd">clear</span> — 重置面板 · 当然，也可以直接用自然语言向引擎提问');
      return;
    }
    if (lower === 'history' || lower === 'archive') {
      $('.nav-item[data-view="history"]').click();
      toast('已切换至 REGRET ARCHIVE。共 ' + fmtCount(archiveCount()) + ' 条，每条都真实发生过。');
      return;
    }
    if (lower === 'about') { $('.nav-item[data-view="about"]').click(); return; }
    if (lower === 'stats' || lower === 'status') {
      toast('UPTIME ' + fmtUptime(Date.now() - BOOT_AT) +
        ' · ARCHIVE ' + fmtCount(archiveCount()) + ' entries · SESSION DECISIONS ' + sessionDecisions.length +
        ' · COURAGE SUBSYSTEM degraded · HOPUM reserves empty');
      return;
    }
    if (lower.indexOf('remember ') === 0) {
      var text = q.slice(9).trim();
      if (!text) { toast('usage: remember &lt;你的黑历史&gt;', 'err'); return; }
      var rec = addRecord(text);
      toast('✓ 已收录为 <span class="toast-cmd">#' + rec.id + '</span>。放心，引擎的嘴很严（它没有嘴，也不联网）。');
      return;
    }
    if (lower.indexOf('sudo ') === 0) {
      toast('sudo: nice try. 权限不足——参考档案 #1089「上次 sudo 的人现在还在还花呗」。', 'err');
      return;
    }
    if (lower === 'exit' || lower === 'quit') {
      toast('cannot terminate: 你已经出不去了。这正是产品的核心功能。', 'err');
      return;
    }

    // default: treat as a decision query
    var looksLikeCommand = /^[a-z0-9_.-]+$/i.test(q) && q.length <= 3;
    if (looksLikeCommand) {
      toast('command not found: <span class="toast-cmd">' + escapeHtml(q) + '</span> — 想提问的话直接输入完整句子。', 'err');
      return;
    }
    ensureEngineView();
    runAnalysis(q);
  }

  function ensureEngineView() {
    if (!$('#view-engine').classList.contains('is-active')) {
      $('.nav-item[data-view="engine"]').click();
    }
  }

  function clearAll() {
    runToken++; isRunning = false;
    btnClear.disabled = false;
    queryText.innerHTML = '<span class="dim">// awaiting input — ask the engine something you will regret not asking</span>';
    chipContext.textContent = '—'; chipRisk.textContent = '—'; chipHorizon.textContent = '—';
    analysisEl.hidden = true;
    resultEl.hidden = true;
    setStatus('ready');
    toast('面板已重置。档案没删——它从来不删。');
  }

  /* ── input handling (IME-safe) ──────────────────────────────── */
  var composing = false;
  input.addEventListener('compositionstart', function () { composing = true; });
  input.addEventListener('compositionend', function () { composing = false; });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (composing) return;
    cancelAutoplay();
    var v = input.value;
    input.value = '';
    handleCommand(v);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (composing || e.isComposing || e.keyCode === 229)) return;
    cancelAutoplay();
  });

  btnClear.addEventListener('click', function () { cancelAutoplay(); clearAll(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input) {
      e.preventDefault(); input.focus();
    }
  });

  /* ── autoplay demo (voter-friendly) ─────────────────────────── */
  var DEMO_QUERY = 'Should I quit my job and start a solo business?';
  var autoplayTimers = [];
  var autoplayCancelled = false;

  function cancelAutoplay() {
    if (autoplayCancelled) return;
    autoplayCancelled = true;
    autoplayTimers.forEach(clearTimeout);
    autoplayTimers = [];
    if (isRunning) { runToken++; isRunning = false; btnClear.disabled = false; setStatus('ready'); }
  }
  function later(fn, ms) {
    autoplayTimers.push(setTimeout(function () { if (!autoplayCancelled) fn(); }, ms));
  }

  function startAutoplay() {
    input.disabled = true;
    later(function () { typeAscii(); }, 200);
    later(function () {
      input.disabled = false;
      var i = 0;
      var typeTimer = setInterval(function () {
        if (autoplayCancelled) { clearInterval(typeTimer); return; }
        input.value = DEMO_QUERY.slice(0, ++i);
        if (i >= DEMO_QUERY.length) {
          clearInterval(typeTimer);
          later(function () {
            input.value = '';
            runAnalysis(DEMO_QUERY);
          }, 420);
        }
      }, 34);
      autoplayTimers.push(typeTimer);
    }, 1900);
  }

  /* ── init ───────────────────────────────────────────────────── */
  renderArchive();
  renderLogs();
  setStatus('ready');
  bootSequence();
  startAutoplay();
  input.focus();

  // deep links: index.html#history / #profiles / #about ...
  var hashView = (location.hash || '').replace('#', '').toLowerCase();
  if (hashView && hashView !== 'engine' && document.getElementById('view-' + hashView)) {
    var navBtn = document.querySelector('.nav-item[data-view="' + hashView + '"]');
    if (navBtn) navBtn.click();
  }

})();
