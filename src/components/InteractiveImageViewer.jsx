import React, { useState, useRef, useEffect } from 'react'
import { MousePointer2 } from 'lucide-react'

/**
 * Interactive Image Viewer with clickable value selection
 * Allows users to click on the image to select/correct extracted values
 */
function InteractiveImageViewer({ 
  imageSrc, 
  extractedData, 
  onValueSelect,
  selectedField,
  zoom = 100,
  onSelectionChange,
  onFieldChange
}) {
  const [clickPosition, setClickPosition] = useState(null)
  const [highlightedField, setHighlightedField] = useState(null)
  const [selectedTextIds, setSelectedTextIds] = useState(new Set())
  const imageRef = useRef(null)
  const containerRef = useRef(null)
  
  // Clear selection when selectedField changes
  useEffect(() => {
    if (selectedField !== null) {
      setSelectedTextIds(new Set())
      if (onSelectionChange) {
        onSelectionChange(0)
      }
    }
  }, [selectedField, onSelectionChange])
  
  // Force recalculation when image loads or zoom changes
  const [boxUpdateKey, setBoxUpdateKey] = useState(0)
  
  useEffect(() => {
    const img = imageRef.current
    if (!img) return
    
    const handleLoad = () => {
      // Small delay to ensure layout is complete
      setTimeout(() => {
        setBoxUpdateKey(prev => prev + 1)
      }, 100)
    }
    
    if (img.complete) {
      handleLoad()
    } else {
      img.addEventListener('load', handleLoad)
      return () => img.removeEventListener('load', handleLoad)
    }
  }, [imageSrc, zoom])

  // Handle click on value box or image
  const handleBoxClick = (e, fieldKey, fieldData) => {
    e.stopPropagation() // Prevent image click handler
    
    if (!imageRef.current) return
    
    const img = imageRef.current
    const rect = img.getBoundingClientRect()
    const naturalWidth = img.naturalWidth || img.width
    const naturalHeight = img.naturalHeight || img.height
    
    // Get bbox position
    const pos = fieldData.position
    let bboxX = 0
    let bboxY = 0
    
    if (pos && pos.bbox) {
      // Use exact bbox coordinates
      const scaleX = rect.width / naturalWidth
      const scaleY = rect.height / naturalHeight
      bboxX = pos.bbox.x * scaleX
      bboxY = pos.bbox.y * scaleY
    } else if (pos) {
      // Fallback to percentage
      bboxX = (pos.char_percent / 100) * rect.width
      bboxY = (pos.line_percent / 100) * rect.height
    }
    
    // Calculate position for learning
    const charPercent = pos ? (pos.char_percent || (bboxX / rect.width) * 100) : 0
    const linePercent = pos ? (pos.line_percent || (bboxY / rect.height) * 100) : 0
    
    const position = {
      x: bboxX,
      y: bboxY,
      char_percent: charPercent,
      line_percent: linePercent,
      line_number: pos?.line_number || 0,
      char_offset: Math.floor(bboxX),
      total_lines: pos?.total_lines || 50,
      line_length: Math.floor(rect.width),
    }
    
    setClickPosition({ x: bboxX, y: bboxY })
    setHighlightedField(fieldKey)
    
    // Notify parent component
    if (onValueSelect) {
      onValueSelect(fieldKey, position)
    }
  }
  
  // Calculate position percentages from click coordinates (for clicking on image directly)
  const handleImageClick = (e) => {
    if (!imageRef.current || !containerRef.current) return

    const img = imageRef.current
    const rect = img.getBoundingClientRect()
    
    // Get click position relative to image
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const naturalWidth = img.naturalWidth || img.width
    const naturalHeight = img.naturalHeight || img.height
    const displayWidth = img.offsetWidth
    const displayHeight = img.offsetHeight
    
    // Convert display coordinates to natural image coordinates
    const scaleX = naturalWidth / displayWidth
    const scaleY = naturalHeight / displayHeight
    
    const naturalX = x * scaleX
    const naturalY = y * scaleY
    
    // Calculate percentages based on natural image size (0-100)
    const charPercent = (naturalX / naturalWidth) * 100
    const linePercent = (naturalY / naturalHeight) * 100
    
    // Check if click is inside any value box
    let clickedField = null
    const fields = [
      'invoiceNumber', 'invoiceDate', 'dueDate',
      'vendorName', 'vendorTaxId', 'customerName', 'customerTaxId',
      'amount', 'taxAmount', 'totalAmount', 'currency', 'iban'
    ]
    
    fields.forEach(fieldKey => {
      const fieldData = extractedData?.[fieldKey]
      if (!fieldData || !fieldData.value || !fieldData.position) return
      
      const boxStyle = calculateHighlightBox(fieldData)
      if (!boxStyle) return
      
      const boxLeft = parseFloat(boxStyle.left)
      const boxTop = parseFloat(boxStyle.top)
      const boxWidth = parseFloat(boxStyle.width)
      const boxHeight = parseFloat(boxStyle.height)
      
      // Check if click is inside box
      if (x >= boxLeft && x <= boxLeft + boxWidth && 
          y >= boxTop && y <= boxTop + boxHeight) {
        clickedField = fieldKey
      }
    })
    
    if (clickedField) {
      // Clicked on a box, handle it
      handleBoxClick(e, clickedField, extractedData[clickedField])
      return
    }
    
    // Clicked outside boxes - find closest field by bbox distance
    const closestField = findClosestField(x, y, extractedData)
    if (closestField) {
      const fieldData = extractedData[closestField]
      handleBoxClick(e, closestField, fieldData)
      return
    }
    
    // No field found near click - just show indicator
    setClickPosition({ x, y })
  }

  // Find field whose bbox contains the click or is closest
  const findClosestField = (clickX, clickY, data) => {
    if (!data) return null
    
    const fields = [
      'invoiceNumber', 'invoiceDate', 'dueDate',
      'vendorName', 'vendorTaxId', 'customerName', 'customerTaxId',
      'amount', 'taxAmount', 'totalAmount', 'currency', 'iban'
    ]
    
    // First, check if click is inside any bbox
    for (const fieldKey of fields) {
      const fieldData = data[fieldKey]
      if (!fieldData || !fieldData.value || !fieldData.position) continue
      
      const boxStyle = calculateHighlightBox(fieldData)
      if (!boxStyle) continue
      
      const boxLeft = parseFloat(boxStyle.left)
      const boxTop = parseFloat(boxStyle.top)
      const boxWidth = parseFloat(boxStyle.width)
      const boxHeight = parseFloat(boxStyle.height)
      
      // Check if click is inside box (with small padding)
      const padding = 5
      if (clickX >= boxLeft - padding && clickX <= boxLeft + boxWidth + padding &&
          clickY >= boxTop - padding && clickY <= boxTop + boxHeight + padding) {
        return fieldKey
      }
    }
    
    // If not inside any box, find closest by distance
    let closestField = null
    let minDistance = Infinity
    
    fields.forEach(fieldKey => {
      const fieldData = data[fieldKey]
      if (!fieldData || !fieldData.value || !fieldData.position) return
      
      const boxStyle = calculateHighlightBox(fieldData)
      if (!boxStyle) return
      
      const boxLeft = parseFloat(boxStyle.left)
      const boxTop = parseFloat(boxStyle.top)
      const boxWidth = parseFloat(boxStyle.width)
      const boxHeight = parseFloat(boxStyle.height)
      
      // Calculate center of box
      const boxCenterX = boxLeft + boxWidth / 2
      const boxCenterY = boxTop + boxHeight / 2
      
      // Calculate distance from click to box center
      const distance = Math.sqrt(
        Math.pow(clickX - boxCenterX, 2) + Math.pow(clickY - boxCenterY, 2)
      )
      
      // If within 50px, consider it a match
      if (distance < 50 && distance < minDistance) {
        minDistance = distance
        closestField = fieldKey
      }
    })
    
    return closestField
  }

  // Get highlight style for a field
  const getFieldHighlight = (fieldKey) => {
    if (highlightedField === fieldKey || selectedField === fieldKey) {
      return {
        position: 'absolute',
        border: '2px solid var(--accent)',
        borderRadius: '4px',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        pointerEvents: 'none',
        zIndex: 10,
      }
    }
    return null
  }

  // Calculate highlight box for extracted values using exact OCR bounding boxes
  const calculateHighlightBox = (textItem) => {
    if (!textItem || !imageRef.current || !containerRef.current) return null
    
    const img = imageRef.current
    const container = containerRef.current
    
    // Get the OCR image dimensions (the preview image size from API)
    // OCR coordinates are relative to this size
    const ocrImageWidth = extractedData?.preview_image_width || img.naturalWidth || img.width
    const ocrImageHeight = extractedData?.preview_image_height || img.naturalHeight || img.height
    
    if (!ocrImageWidth || !ocrImageHeight) return null
    
    // Get displayed image dimensions (after CSS scaling and zoom transform)
    // getBoundingClientRect() accounts for CSS transforms
    const imgRect = img.getBoundingClientRect()
    const displayedWidth = imgRect.width
    const displayedHeight = imgRect.height
    
    // Calculate scale factors from OCR image size to displayed size
    const scaleX = displayedWidth / ocrImageWidth
    const scaleY = displayedHeight / ocrImageHeight
    
    // Get image position relative to container
    // offsetLeft/offsetTop are relative to the container
    const imgOffsetLeft = img.offsetLeft
    const imgOffsetTop = img.offsetTop
    
    // Scale OCR bbox coordinates (relative to OCR image) to displayed coordinates
    const scaledX = textItem.x * scaleX
    const scaledY = textItem.y * scaleY
    const scaledWidth = textItem.width * scaleX
    const scaledHeight = textItem.height * scaleY
    
    // Position boxes relative to container (use OCR bbox).
    // Slightly EXPAND by ~1px so boxes cover glyphs better (OCR bboxes can be tight).
    // Important: when rendering, use boxSizing: 'border-box' so borders don't inflate the box.
    return {
      left: `${imgOffsetLeft + scaledX - 1}px`,
      top: `${imgOffsetTop + scaledY - 1}px`,
      width: `${Math.max(1, scaledWidth + 2)}px`,
      height: `${Math.max(1, scaledHeight + 2)}px`,
    }
  }

  return (
    <div 
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        cursor: 'crosshair',
      }}
      onClick={handleImageClick}
    >
      <img
        ref={imageRef}
        src={imageSrc}
        alt="Invoice"
        style={{
          width: 'auto',
          height: 'auto',
          maxWidth: '100%',
          display: 'block',
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'top left',
          transition: 'transform 0.2s',
        }}
      />
      
      {/* Display ALL extracted text as individual words */}
      {extractedData?.all_extracted_text && extractedData.all_extracted_text.map((textItem, index) => {
        if (!textItem || !textItem.text || !imageRef.current || !containerRef.current) return null
        
        // Use boxUpdateKey to force recalculation
        const boxStyle = calculateHighlightBox(textItem)
        if (!boxStyle) return null
        
        const textId = `text-${index}`
        const isSelected = selectedTextIds.has(textId)
        const isHovered = highlightedField === textId
        
        return (
          <div
            key={textId}
            onClick={(e) => {
              e.stopPropagation()
              
              // Only allow selection if a field is selected
              if (!selectedField) {
                return
              }
              
              // Toggle selection (allow multiple)
              const newSelected = new Set(selectedTextIds)
              if (isSelected) {
                newSelected.delete(textId)
              } else {
                newSelected.add(textId)
              }
              setSelectedTextIds(newSelected)
              
              // Get all selected texts
              const selectedTexts = extractedData.all_extracted_text
                .filter((_, idx) => newSelected.has(`text-${idx}`))
                .map(item => item.text)
                .join(' ')
              
              // Calculate click position for visual indicator
              if (imageRef.current && containerRef.current) {
                const img = imageRef.current
                const imgRect = img.getBoundingClientRect()
                const naturalWidth = img.naturalWidth || img.width
                const scaleX = imgRect.width / naturalWidth
                const scaleY = imgRect.height / (img.naturalHeight || img.height)
                setClickPosition({ x: textItem.x * scaleX, y: textItem.y * scaleY })
              }
              
              // Notify parent about selection change
              if (onSelectionChange) {
                onSelectionChange(newSelected.size)
              }
              
              // Notify parent with all selected texts combined - only if field is selected
              if (onValueSelect && newSelected.size > 0 && selectedField && selectedTexts) {
                const img = imageRef.current
                if (img) {
                  const naturalWidth = img.naturalWidth || img.width
                  const naturalHeight = img.naturalHeight || img.height
                  
                  // Use position of first selected item
                  const firstSelected = extractedData.all_extracted_text
                    .find((_, idx) => newSelected.has(`text-${idx}`)) || textItem
                  
                  const position = {
                    x: firstSelected.x,
                    y: firstSelected.y,
                    char_percent: (firstSelected.x / naturalWidth) * 100,
                    line_percent: (firstSelected.y / naturalHeight) * 100,
                    line_number: Math.floor((firstSelected.y / naturalHeight) * 50),
                    char_offset: Math.floor(firstSelected.x),
                    total_lines: 50,
                    line_length: Math.floor(naturalWidth),
                    bbox: {
                      x: firstSelected.x,
                      y: firstSelected.y,
                      width: firstSelected.width,
                      height: firstSelected.height
                    }
                  }
                  // Call with selectedTexts as the third parameter
                  onValueSelect(null, position, selectedTexts)
                }
              } else if (newSelected.size === 0 && onValueSelect) {
                // Clear selection
                onValueSelect(null, null, '')
              }
            }}
            onMouseEnter={() => setHighlightedField(textId)}
            onMouseLeave={() => setHighlightedField(null)}
            style={{
              ...boxStyle,
              position: 'absolute',
              boxSizing: 'border-box',
              // Make borders scale with zoom so they don't look huge when zoomed out
              border: isSelected
                ? `${Math.max(1, Math.round(2 * (zoom / 100)))}px solid #3b82f6`
                : `${Math.max(1, Math.round(1 * (zoom / 100)))}px solid rgba(156, 163, 175, 0.55)`,
              borderRadius: '1px',
              // Keep unselected very subtle; highlight only on hover/selected
              backgroundColor: isSelected
                ? 'rgba(59, 130, 246, 0.10)'
                : isHovered
                ? 'rgba(156, 163, 175, 0.08)'
                : 'transparent',
              cursor: 'pointer',
              zIndex: isSelected ? 10 : (isHovered ? 8 : 5),
              transition: 'all 0.15s',
            }}
          />
        )
      })}
      
    </div>
  )
}

export default InteractiveImageViewer

