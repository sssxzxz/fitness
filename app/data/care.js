// 对症处理方案（第一版）：确认是哪块肌肉后，可以自己先做的处理。
// release 放松（自我按压/筋膜球）· stretch 拉伸（动作库 id 或文字）· strengthen 强化（动作库 id）· daily 日常调整
// 动作库 id 见 exercises.js；写成文字的条目会原样显示。
window.CARE_GENERAL = {
  acute: { title: '急性期（刚出现 / 明显加重的 1–3 天）', items: ['相对休息：避开会诱发疼痛的动作，但不必完全不动，在不痛范围内轻微活动。', '冷敷或热敷以舒服为准：刚拉伤、局部发热肿胀时冷敷 10–15 分钟；单纯僵硬酸紧时热敷。', '不做用力拉伸和深度按压。'] },
  sub: { title: '恢复期（疼痛减轻后）', items: ['先放松，再拉伸，最后做轻量强化。', '疼痛监测：训练时疼痛不超过 3/10，第二天不比之前更痛，就可以继续并逐步加量。', '每 1–2 周用“逐项测试”复查一次，看结果有没有变化。'] },
  doctor: { title: '需要就医', items: ['2 周规范处理仍无改善，或越来越重。', '出现麻木、无力、放射痛、夜间痛、发热，或本页面“需要就医的信号”中的任何一条。'] },
  release_how: '筋膜球或手指按住压痛点，压力约 5–6/10（明显但可以放松呼吸），保持 30–90 秒或直到痛感下降一半；也可在压住的同时缓慢活动相关关节。每天 1–2 次。'
};
window.CARE = {
 masseter: { release: '手指在下颌角前上方的咬肌上画小圈按揉，或张口时向下推，每侧 60 秒。', stretch: ['缓慢张大口保持 10 秒 × 5 次'], strengthen: [], daily: ['留意白天是否紧咬牙：保持“唇闭、齿分、舌顶上颚”。', '夜间磨牙明显可咨询口腔科做咬合垫。', '少嚼口香糖和过硬食物。'] },
 temporalis: { release: '四指在太阳穴区域画小圈按揉 60–90 秒。', stretch: ['张口并向对侧偏移下颌，保持 10 秒'], strengthen: [], daily: ['同咬肌：避免白天紧咬牙。', '紧张性头痛时配合颈部放松。'] },
 lat_pterygoid: { release: '体表难以触及，以放松下颌为主：热敷耳前 10 分钟。', stretch: ['轻轻后缩下颌保持 10 秒'], strengthen: [], daily: ['避免长时间张大口、啃硬物。', '张口受限、关节绞锁需看口腔颌面科。'] },
 med_pterygoid: { release: '手指勾在下颌角内侧轻柔按压 30–60 秒（力量要轻）。', stretch: ['缓慢张大口保持 10 秒'], strengthen: [], daily: ['同咬肌。'] },
 occipitofrontalis: { release: '指腹按住头皮缓慢推移，前额和后枕各 60 秒。', stretch: [], strengthen: [], daily: ['减少长时间皱眉、抬眉；注意用眼休息。'] },
 digastric: { release: '下巴下方用拇指轻轻向上按揉 30–60 秒。', stretch: ['闭口头后仰保持 10 秒'], strengthen: [], daily: ['改善头前伸姿势：做收下巴训练。'] },
 scm: { release: '头稍转向对侧，用拇指和食指捏住整条肌腹，从上到下逐段捏 5–10 秒。不要按压颈前正中。', stretch: ['st_scm'], strengthen: ['chin_tuck', 'neck_iso'], daily: ['电脑屏幕调到正前方、视线略低，避免长时间转头看副屏。', '睡觉枕头高度让颈部保持中立。'] },
 scalene_ant: { release: '头偏向同侧放松，在锁骨上方轻轻按压 30 秒（出现手麻立即停止）。', stretch: ['st_scm'], strengthen: ['breathing_9090', 'chin_tuck'], daily: ['练习腹式呼吸，减少耸肩式呼吸。', '背包换肩或改用双肩包。'] },
 scalene_mid: { release: '颈侧中部轻轻按压 30 秒。', stretch: ['st_scm'], strengthen: ['breathing_9090'], daily: ['同前斜角肌。'] },
 scalene_post: { release: '颈根后外侧轻压 30 秒。', stretch: ['压肩，头向对侧侧屈 + 低头 + 转向对侧，保持 30 秒'], strengthen: ['breathing_9090'], daily: ['同前斜角肌。'] },
 deep_neck_flexors: { release: '无需放松。', stretch: [], strengthen: ['chin_tuck', 'neck_iso'], daily: ['每工作 30–45 分钟做 5 次收下巴。', '手机抬到眼睛高度看。'] },
 upper_trap: { release: '对侧手捏住肩上缘的肌肉 30–60 秒；或背靠墙用筋膜球压在肩上缘与肩胛之间。', stretch: ['st_upper_trap'], strengthen: ['prone_y', 'wall_slide', 'pushup_plus'], daily: ['打字时手肘有支撑、肩膀放松下沉。', '不要单肩背重包。', '减少耸肩呼吸，多做腹式呼吸。'] },
 levator_scap: { release: '背靠墙，把筋膜球放在肩胛骨上角上方，屈膝上下小幅滚动或定点压 60 秒。', stretch: ['st_levator'], strengthen: ['prone_y', 'wall_slide'], daily: ['避免长时间低头侧转看手机。', '落枕时先热敷，再做轻柔拉伸。'] },
 splenius_capitis: { release: '手指按在乳突后下方，配合缓慢点头 60 秒。', stretch: ['低头 + 向对侧侧屈 + 转向对侧，保持 30 秒'], strengthen: ['neck_ext_quad', 'neck_iso'], daily: ['避免头前伸、长时间仰头看屏幕。'] },
 splenius_colli: { release: '颈根后外侧用筋膜球靠墙轻压 60 秒。', stretch: ['低头 + 向对侧侧屈 + 转向对侧，保持 30 秒'], strengthen: ['neck_ext_quad'], daily: ['同头夹肌。'] },
 deep_neck_ext: { release: '仰卧，网球或双球放在颈椎两侧（不压棘突），轻轻点头 60 秒。', stretch: ['收下巴后低头，保持 30 秒'], strengthen: ['neck_ext_quad', 'neck_iso'], daily: ['同颈深屈肌。'] },
 suboccipital: { release: '仰卧，两个网球用袜子装好放在枕骨下缘，让头的重量压上去 1–2 分钟，可轻轻点头。', stretch: ['收下巴 + 点头，双手托后枕向上轻牵 30 秒'], strengthen: ['chin_tuck'], daily: ['屏幕上沿与眼睛平齐，避免仰头看。', '戴合适度数的眼镜，减少前探看屏幕。'] },
 platysma: { release: '无需特别处理。', stretch: ['头后仰，张口放松'], strengthen: [], daily: ['放松面部和下颌。'] },
 pec_major: { release: '面对墙站立，筋膜球放在锁骨下方和胸前外侧，身体前压并缓慢移动手臂 60–90 秒。', stretch: ['st_pec'], strengthen: ['row', 'face_pull', 'prone_t'], daily: ['久坐时每 30 分钟做一次扩胸。', '卧推、俯卧撑训练量大时配合等量的划船类动作。'] },
 pec_minor: { release: '筋膜球放在喙突内下方，面对墙轻压 60 秒，可同时把手臂缓慢上举。', stretch: ['st_pec'], strengthen: ['prone_y', 'wall_slide', 'pushup_plus'], daily: ['避免含胸驼背；侧睡时抱个枕头，防止肩膀向前卷。'] },
 serratus_ant: { release: '侧卧，用手指在腋下肋骨上轻按 30–60 秒。', stretch: ['双手背后相扣，挺胸保持 30 秒'], strengthen: ['pushup_plus', 'wall_slide', 'pushup'], daily: ['翼状肩明显时优先练前锯肌，暂时减少大重量推举。'] },
 subclavius: { release: '锁骨中段下缘轻按 30 秒。', stretch: ['耸肩并后缩，保持 10 秒'], strengthen: [], daily: ['同胸小肌。'] },
 intercostals: { release: '在压痛的肋间隙用指腹轻按 30 秒（不按肋骨本身）。', stretch: ['手臂上举向对侧侧屈 + 深吸气', 'thoracic_rot'], strengthen: ['breathing_9090'], daily: ['咳嗽、打喷嚏时可用手按住痛处减轻牵拉。', '排除心肺问题后再自行处理。'] },
 diaphragm: { release: '仰卧屈膝，呼气时手指在肋弓下缘轻轻向上勾入 30 秒（饭后不做）。', stretch: [], strengthen: ['breathing_9090', 'drawing_in'], daily: ['每天 2–3 次、每次 5 分钟腹式呼吸。', '跑步岔气时放慢速度，深呼气。'] },
 rectus_abd: { release: '一般无需放松；拉伤时急性期休息。', stretch: ['俯卧撑起上身（眼镜蛇式）30 秒'], strengthen: ['dead_bug', 'plank', 'crunch'], daily: ['腹直肌分离者先练腹横肌与呼吸，避免大重量卷腹。'] },
 ext_oblique: { release: '侧卧，用手指沿肋弓下方侧腹按揉 60 秒。', stretch: ['thoracic_rot', '站立向对侧侧屈 + 转向同侧 30 秒'], strengthen: ['side_plank', 'pallof', 'oblique_crunch'], daily: ['转体类运动（网球、高尔夫）前充分热身。'] },
 int_oblique: { release: '同腹外斜肌，在髂前上棘内上方按揉。', stretch: ['站立向对侧侧屈 + 转向对侧 30 秒'], strengthen: ['side_plank', 'pallof'], daily: ['同腹外斜肌。'] },
 transversus_abd: { release: '无需放松。', stretch: [], strengthen: ['drawing_in', 'dead_bug', 'bird_dog', 'plank'], daily: ['搬重物前先轻收腹再发力。'] },
 ql: { release: '侧卧或仰卧，把筋膜球放在第 12 肋与髂嵴之间、竖脊肌外侧，压 60–90 秒，可缓慢屈伸同侧腿。', stretch: ['st_ql', 'st_lat'], strengthen: ['side_plank', 'farmer', 'bird_dog'], daily: ['避免长时间单侧站立“挂髋”。', '久坐时双脚着地、两侧坐骨均匀受力。', '钱包不要放后裤兜坐着。'] },
 mid_trap: { release: '仰卧，筋膜球放在肩胛骨与脊柱之间，缓慢移动 60 秒。', stretch: ['抱肩拱背 30 秒'], strengthen: ['prone_t', 'face_pull', 'row'], daily: ['同上斜方肌。'] },
 lower_trap: { release: '一般无需放松。', stretch: [], strengthen: ['prone_y', 'wall_slide', 'face_pull'], daily: ['举手过头时有意识把肩胛往后下收。'] },
 rhomboids: { release: '仰卧或靠墙，筋膜球放在肩胛骨内侧缘与脊柱之间，双手抱胸让肩胛打开，压 60–90 秒。', stretch: ['双手前伸相扣拱背 30 秒'], strengthen: ['row', 'prone_t'], daily: ['肩胛间痛常与久坐含胸、颈椎问题有关，注意坐姿和屏幕高度。'] },
 lats: { release: '侧卧，泡沫轴放在腋下后方，小幅上下滚动 60–90 秒。', stretch: ['st_lat'], strengthen: ['lat_pulldown', 'pullup', 'straight_arm', 'row'], daily: ['举手过头受限（手臂举不直）可先放松拉伸背阔肌。'] },
 iliocostalis: { release: '仰卧，泡沫轴横放在背部（腰部用双球放在脊柱两侧，不直接滚腰椎），缓慢移动 60 秒。', stretch: ['cat_cow', 'st_lat'], strengthen: ['bird_dog', 'back_ext', 'side_plank'], daily: ['久坐每 30–45 分钟起身活动。', '弯腰搬物改为屈髋屈膝。'] },
 longissimus: { release: '同髂肋肌。', stretch: ['cat_cow', '婴儿式 30 秒'], strengthen: ['bird_dog', 'back_ext', 'rdl'], daily: ['同髂肋肌。', '晨僵超过 30 分钟、活动后反而减轻且持续数月，应就医。'] },
 spinalis: { release: '胸椎段用泡沫轴横向缓慢滚动 60 秒。', stretch: ['cat_cow', 'thoracic_rot'], strengthen: ['bird_dog', 'prone_y'], daily: ['同髂肋肌。'] },
 multifidus: { release: '仰卧，双球（袜子装两个网球）放在腰椎两侧，屈膝轻轻左右摆膝 60 秒。', stretch: ['抱膝团身 30 秒', 'cat_cow'], strengthen: ['drawing_in', 'bird_dog', 'glute_bridge', 'dead_bug'], daily: ['腰痛缓解后坚持多裂肌和腹横肌训练，减少复发。'] }
};
