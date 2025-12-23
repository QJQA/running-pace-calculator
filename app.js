// 状态管理
const state = {
  plan: null
}

// DOM 元素引用
const els = {
  distanceInput: document.getElementById('distanceInput'),
  distancePreset: document.getElementById('distancePreset'),
  timeHours: document.getElementById('timeHours'),
  timeMinutes: document.getElementById('timeMinutes'),
  progressiveStep: document.getElementById('progressiveStep'),
  progressiveSec: document.getElementById('progressiveSec'),
  btnCalc: document.getElementById('btnCalc'),
  btnReset: document.getElementById('btnReset'),
  btnRecompute: document.getElementById('btnRecompute'),
  errorMsg: document.getElementById('errorMsg'),
  resultSection: document.getElementById('resultSection'),
  resAvgPace: document.getElementById('resAvgPace'),
  resTargetTime: document.getElementById('resTargetTime'),
  resFinalTime: document.getElementById('resFinalTime'),
  finalTimeCard: document.getElementById('finalTimeCard'),
  segmentsBody: document.getElementById('segmentsBody'),
  statusTag: document.getElementById('statusTag')
}

// 工具函数
const pad2 = (n) => n < 10 ? '0' + n : '' + n

const parseTime = (h, m) => {
  const hh = parseInt(h || 0, 10)
  const mm = parseInt(m || 0, 10)
  return hh * 3600 + mm * 60
}

const formatMmss = (sec) => {
  const s = Math.max(0, Math.round(sec))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${pad2(mm)}:${pad2(ss)}`
}

const formatHhmm = (sec) => {
  const s = Math.max(0, Math.round(sec))
  const totalMin = Math.round(s / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${pad2(h)}:${pad2(m)}`
}

const mmssToSec = (str) => {
  const parts = str.trim().split(':')
  if (parts.length !== 2) return NaN
  const mm = parseInt(parts[0], 10)
  const ss = parseInt(parts[1], 10)
  if (isNaN(mm) || isNaN(ss) || ss < 0 || ss >= 60) return NaN
  return mm * 60 + ss
}

// 交互逻辑
const handlePresetChange = () => {
  const val = els.distancePreset.value
  if (val) {
    els.distanceInput.value = val
    // 重置 select 以便下次还能选同一个
    // 但为了让用户知道当前选了啥，可以不重置？
    // 不，如果用户修改了input，select应该失效。
    // 简单做法：选了就填入，填完就忘。
    // 为了让 "Custom" 感觉自然，我们可以在用户手动输入时，重置 select 为 default
  }
}

// 监听输入框，如果用户手动输入，且值不在预设中，可以把 select 置为 default
const handleInputChange = () => {
  // Optional: check if matches any preset, if not, reset select
  // For now, let's just leave select as is or reset it
  els.distancePreset.value = "" // Reset to "快速选择" placeholder
}

const getDistance = () => {
  const val = parseFloat(els.distanceInput.value)
  return isNaN(val) ? 0 : val
}

const showError = (msg) => {
  els.errorMsg.textContent = msg
  els.errorMsg.classList.remove('hidden')
  els.errorMsg.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const clearError = () => {
  els.errorMsg.classList.add('hidden')
  els.errorMsg.textContent = ''
}

// 核心算法：生成渐进配速
const calculatePlan = () => {
  clearError()
  
  const distance = getDistance()
  const hours = els.timeHours.value
  const minutes = els.timeMinutes.value
  const targetTimeSec = parseTime(hours, minutes)
  
  // 校验
  if (distance < 3) {
    showError('目标距离不能小于 3 公里')
    return
  }
  
  if (targetTimeSec <= 0) {
    showError('请输入有效的期望时间')
    return
  }
  
  const avgPace = targetTimeSec / distance // sec/km
  // 简单合理性检查 (配速 2:00 ~ 15:00)
  if (avgPace < 120 || avgPace > 900) {
    showError(`计算出的平均配速为 ${formatMmss(avgPace)}/km，似乎不太合理，请检查输入`)
    // 只是警告，不阻止？还是阻止？一般阻止比较好，防止溢出
    // return 
    // 用户反馈说要灵活，先允许吧，或者提示即可
  }

  const progStep = parseFloat(els.progressiveStep.value)
  const progSec = parseFloat(els.progressiveSec.value) || 0
  
  // 算法：
  // 我们需要构建分段，使得 总时间 = targetTimeSec
  // 假设分段配速是线性减少的（前慢后快）。
  // 设第一段配速为 P_start
  // 第 i 段配速 P_i = P_start - (group_index * progSec)
  // 约束：Sum(P_i * dist_i) = targetTimeSec
  
  // 1. 生成分段距离结构
  const segments = []
  let remainingDist = distance
  while (remainingDist > 0.001) {
    let d = remainingDist >= progStep ? progStep : remainingDist
    // 处理最后一段很短的情况：如果剩余 < 0.1km，合并到上一段？
    // 或者严格按照步长切分。为了简单和精确，最后一段就是剩余的。
    // 但是如果步长是1km，跑10.5km，最后一段0.5km。
    segments.push({ distance: d, groupIndex: segments.length })
    remainingDist -= d
  }
  
  // 2. 计算基准配速
  // Target = Sum( (Base - i * delta) * d_i )
  // Target = Base * Sum(d_i) - delta * Sum(i * d_i)
  // Target = Base * TotalDist - delta * WeightedSum
  // Base = (Target + delta * WeightedSum) / TotalDist
  
  const totalDist = distance
  const weightedSum = segments.reduce((acc, seg, idx) => acc + (idx * progSec * seg.distance), 0)
  
  const basePace = (targetTimeSec + weightedSum) / totalDist
  
  // 3. 生成结果
  const planSegments = segments.map((seg, idx) => {
    const pace = basePace - (idx * progSec)
    return {
      id: idx + 1,
      distance: seg.distance,
      pace: pace,
      duration: pace * seg.distance
    }
  })
  
  // 检查是否有配速过快（<=0）的情况
  if (planSegments.some(s => s.pace <= 0)) {
    showError('渐进幅度过大，导致后程配速为负，请减小渐进秒数')
    return
  }

  state.plan = planSegments
  renderResult(distance, targetTimeSec, planSegments)
}

const renderResult = (distance, targetTimeSec, segments) => {
  els.resultSection.classList.remove('hidden')
  
  // 核心指标
  const avgPace = targetTimeSec / distance
  els.resAvgPace.textContent = formatMmss(avgPace)
  els.resTargetTime.textContent = formatHhmm(targetTimeSec)
  
  updateFinalTime() // 计算并显示预估用时（初始等于目标用时）
  
  // 渲染表格
  renderTable(segments)
  
  // 滚动到结果
  els.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const renderTable = (segments) => {
  els.segmentsBody.innerHTML = ''
  segments.forEach((seg, idx) => {
    const tr = document.createElement('tr')
    
    // 累计距离
    const cumDist = segments.slice(0, idx+1).reduce((a, b) => a + b.distance, 0)
    
    tr.innerHTML = `
      <td>${seg.id}</td>
      <td>${cumDist.toFixed(2)} <span style="color:#999;font-size:12px">(${seg.distance.toFixed(2)})</span></td>
      <td>
        <input type="text" class="table-input pace-input" 
          data-idx="${idx}" 
          value="${formatMmss(seg.pace)}" 
          onblur="handlePaceEdit(this)">
      </td>
      <td class="duration-cell">${formatMmss(seg.duration)}</td>
    `
    els.segmentsBody.appendChild(tr)
  })
  
  els.statusTag.textContent = '已优化'
  els.statusTag.style.background = '#E0F2FE'
  els.statusTag.style.color = '#0284C7'
}

// 处理表格内配速编辑
window.handlePaceEdit = (input) => {
  const idx = parseInt(input.dataset.idx)
  const val = input.value
  const sec = mmssToSec(val)
  
  if (isNaN(sec)) {
    input.classList.add('invalid')
    return
  }
  
  input.classList.remove('invalid')
  // 更新 state
  if (state.plan && state.plan[idx]) {
    state.plan[idx].pace = sec
    state.plan[idx].duration = sec * state.plan[idx].distance
    
    // 更新该行的用时显示
    const tr = input.closest('tr')
    const durCell = tr.querySelector('.duration-cell')
    if (durCell) durCell.textContent = formatMmss(state.plan[idx].duration)
    
    // 标记状态为“已手动修改”
    els.statusTag.textContent = '手动修改'
    els.statusTag.style.background = '#FEF3C7' // 黄色
    els.statusTag.style.color = '#D97706'
  }
}

const recomputeTotal = () => {
  if (!state.plan) return
  
  // 重新计算总用时和平均配速
  const totalDur = state.plan.reduce((acc, s) => acc + s.duration, 0)
  const totalDist = state.plan.reduce((acc, s) => acc + s.distance, 0)
  
  // 更新顶部卡片
  // 注意：这里更新的是 "预估用时"， "目标用时" 保持不变
  els.resFinalTime.textContent = formatHhmm(totalDur)
  
  // 如果误差很大，高亮显示
  const targetH = parseInt(els.timeHours.value || 0)
  const targetM = parseInt(els.timeMinutes.value || 0)
  const targetSec = targetH * 3600 + targetM * 60
  
  const diff = Math.abs(totalDur - targetSec)
  if (diff > 60) {
    els.finalTimeCard.style.borderColor = '#F59E0B' // 警告色
  } else {
    els.finalTimeCard.style.borderColor = '#E5E7EB'
  }
  
  // 重新计算平均配速
  const newAvg = totalDur / totalDist
  els.resAvgPace.textContent = formatMmss(newAvg)
}

const updateFinalTime = () => {
  if (!state.plan) return
  const totalDur = state.plan.reduce((acc, s) => acc + s.duration, 0)
  els.resFinalTime.textContent = formatHhmm(totalDur)
  els.finalTimeCard.style.borderColor = '#E5E7EB'
}

const resetAll = () => {
  els.distanceInput.value = ''
  els.distancePreset.value = ''
  els.timeHours.value = ''
  els.timeMinutes.value = ''
  els.progressiveSec.value = '0'
  els.progressiveStep.value = '2' // Reset to default 2
  
  clearError()
  els.resultSection.classList.add('hidden')
  state.plan = null
}

// 事件绑定
els.btnCalc.addEventListener('click', calculatePlan)
els.btnReset.addEventListener('click', resetAll)
els.btnRecompute.addEventListener('click', recomputeTotal)
els.distancePreset.addEventListener('change', handlePresetChange)
els.distanceInput.addEventListener('input', handleInputChange)

// Tooltip 交互逻辑
const initTooltips = () => {
  const popup = document.getElementById('tooltipPopup')
  let activeIcon = null

  document.addEventListener('click', (e) => {
    const icon = e.target.closest('.tooltip-icon')
    
    if (icon) {
      e.stopPropagation() // 阻止冒泡，防止被下方的 click listener 关闭
      
      // 如果点击的是当前已打开的 tooltip 图标，则关闭
      if (activeIcon === icon && !popup.classList.contains('hidden')) {
        popup.classList.add('hidden')
        popup.classList.remove('visible')
        activeIcon = null
        return
      }
      
      activeIcon = icon
      const content = icon.dataset.tooltip
      popup.textContent = content
      
      // 先显示（为了计算尺寸），但设为不可见（通过 opacity）
      popup.classList.remove('hidden')
      popup.classList.remove('visible') 
      
      // 计算位置
      const iconRect = icon.getBoundingClientRect()
      const popupRect = popup.getBoundingClientRect()
      
      // 默认显示在上方，居中
      let top = iconRect.top + window.scrollY - popupRect.height - 10
      let left = iconRect.left + window.scrollX - (popupRect.width / 2) + (iconRect.width / 2)
      
      // 边界检查：防止溢出屏幕左侧或右侧
      if (left < 10) left = 10
      if (left + popupRect.width > window.innerWidth - 10) {
        left = window.innerWidth - popupRect.width - 10
      }
      
      // 防止溢出顶部
      if (top < window.scrollY) {
        // 如果上方不够，显示在下方
        top = iconRect.bottom + window.scrollY + 10
        // 修改箭头方向？CSS 需要支持。暂时简化，只调整位置。
        // 或者修改 popup 的 class 来改变箭头
        popup.classList.add('bottom-arrow') // 假设以后支持，当前 CSS 未实现倒箭头
      } else {
        popup.classList.remove('bottom-arrow')
      }
      
      popup.style.top = `${top}px`
      popup.style.left = `${left}px`
      
      // 下一帧显示（产生过渡效果）
      requestAnimationFrame(() => {
        popup.classList.add('visible')
      })
      
    } else {
      // 点击空白处关闭
      // 如果点击的不是 tooltip 自身
      if (popup && !popup.contains(e.target)) {
        if (popup.classList.contains('visible')) {
          popup.classList.remove('visible')
          // 等待过渡动画结束后隐藏
          setTimeout(() => {
             // 再次检查状态，防止快速点击导致的问题
             if (!popup.classList.contains('visible')) {
               popup.classList.add('hidden')
             }
          }, 200)
          activeIcon = null
        }
      }
    }
  })
  
  // 窗口大小改变时隐藏，避免位置错误
  window.addEventListener('resize', () => {
    if(popup && !popup.classList.contains('hidden')) {
        popup.classList.remove('visible')
        popup.classList.add('hidden')
        activeIcon = null
    }
  })
}

// 初始化 Tooltips
initTooltips()
