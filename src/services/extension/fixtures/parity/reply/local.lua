msg_reply["local text"] = {
  type = "Reply",
  keyword = { match = "fixture local" },
  echo = "local hello {nick}"
}
msg_reply["local callback"] = {
  type = "Order",
  keyword = { prefix = ".local " },
  echo = function(msg) return "local " .. msg.uid .. ":" .. msg.suffix end
}
event["observe message"] = {
  trigger = { hook = "Message" },
  action = { lua = function() return event.Event .. ":" .. event.uid .. ":" .. event.fromMsg end }
}
event["record clue"] = {
  trigger = { hook = "Message" },
  action = { lua = function()
    if event.fromMsg ~= "调查钟楼" then return end
    dice.setUserData(event.uid, "clue", event.fromMsg)
    dice.setGroupData(event.gid, "investigator", event.uid)
    if event.uid == "102" then error("fixture failure") end
  end }
}
msg_reply["clue data"] = {
  type = "Order",
  keyword = { match = ".clue-data" },
  echo = function(msg)
    return dice.getUserData(msg.uid, "clue") .. ":" .. dice.getGroupData(msg.gid, "investigator")
  end
}
msg_reply["clue failure"] = {
  type = "Order",
  keyword = { match = ".clue-fail" },
  echo = function(msg)
    dice.setGroupData(msg.gid, "investigator", "invalid")
    error("fixture failure")
  end
}
