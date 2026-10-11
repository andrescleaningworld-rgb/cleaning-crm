const SPREADSHEET_ID = "10MDGlN8pVKVcthd2MA5ygsBLVI3nN3DF98i_cF-Pqjs";

/* =========================================================
   CLEANING WORLD APP - COMPLETE APPS SCRIPT
   Corrected final version:
   - Uses working sheet-reading logic
   - Supports getAccounts + accounts
   - Supports getAllAccounts + allAccounts for cancelled accounts/reports
   - Returns both data and page-specific keys
   - Keeps sales delete
   - Keeps subcontractor scoring
   - Keeps internal emails
   - Keeps subcontractor complaint notification emails
========================================================= */

function doGet(e) {
  try {
    const action =
      e && e.parameter && e.parameter.action ? e.parameter.action : "";

    if (!action) {
      return jsonResponse({
        success: true,
        message: "Cleaning World API is running.",
        version: "cleaning-world-final-working",
        availableActions: [
          "getAccounts",
          "accounts",
          "getAllAccounts",
          "allAccounts",
          "getVisits",
          "visits",
          "getComplaints",
          "complaints",
          "getAccountUpdates",
          "accountUpdates",
          "getUpdates",
          "updates",
          "getSales",
          "sales",
          "getSubcontractors",
          "subcontractors",
          "getSubs",
          "subs",
          "getManagers",
          "managers",
          "getSettings",
          "settings",
          "getToDos",
          "todos",
          "getSubTransferProposals",
          "subTransferProposals",
          "testPhotoUpload",
          "testSubPortalIssue",
        ],
      });
    }

    if (action === "getAccounts" || action === "accounts") {
      const accounts = getAccounts();

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: accounts.length,
        data: accounts,
        accounts: accounts,
      });
    }

    if (action === "getAllAccounts" || action === "allAccounts") {
      const accounts = getAllAccounts();

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: accounts.length,
        data: accounts,
        accounts: accounts,
      });
    }

    if (action === "getVisits" || action === "visits") {
      const visits = getVisits();

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: visits.length,
        data: visits,
        visits: visits,
      });
    }
    if (action === "getToDos" || action === "todos") {
  const todos = getToDos();

  return jsonResponse({
    success: true,
    actionReceived: action,
    count: todos.todos ? todos.todos.length : 0,
    data: todos.todos || [],
    todos: todos.todos || [],
  });
}

    if (action === "getComplaints" || action === "complaints") {
      const complaints = getComplaints();

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: complaints.length,
        data: complaints,
        complaints: complaints,
      });
    }
    if (action === "getMapAccounts" || action === "mapAccounts") {
      const accounts = getMapAccountsFast();

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: accounts.length,
        data: accounts,
        accounts: accounts,
        mapAccounts: accounts,
      });
    }

    if (
      action === "getAccountUpdates" ||
      action === "accountUpdates" ||
      action === "getUpdates" ||
      action === "updates"
    ) {
      const accountUpdates = getAccountUpdates();

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: accountUpdates.length,
        data: accountUpdates,
        accountUpdates: accountUpdates,
        updates: accountUpdates,
      });
    }

    if (action === "getSales" || action === "sales") {
      const sales = getSales();

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: sales.length,
        data: sales,
        sales: sales,
      });
    }

    if (
      action === "getSubcontractors" ||
      action === "subcontractors" ||
      action === "getSubs" ||
      action === "subs"
    ) {
      const subcontractors = getSubcontractors();

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: subcontractors.length,
        data: subcontractors,
        subcontractors: subcontractors,
        subs: subcontractors,
      });
    }
    if (
  action === "getSubTransferProposals" ||
  action === "subTransferProposals"
) {
  const proposals = getSubTransferProposals();

  return jsonResponse({
    success: true,
    actionReceived: action,
    count: proposals.length,
    data: proposals,
    proposals: proposals,
    subTransferProposals: proposals,
  });
}
    if (
    action === "respondSubTransferProposal" ||
    action === "subTransferProposalResponse"
) {
  return respondSubTransferProposal(e.parameter || {});
}

    if (action === "getManagers" || action === "managers") {
      const managers = getOptionalSheetRows(["Managers", "Manager"]);

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: managers.length,
        data: managers,
        managers: managers,
      });
    }

    if (action === "getSettings" || action === "settings") {
      const settings = getOptionalSheetRows(["Settings", "Setting"]);

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: settings.length,
        data: settings,
        settings: settings,
      });
    }
        if (action === "getSupplyItems" || action === "supplyItems") {
      const supplyItems = getSupplyItems();

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: supplyItems.length,
        data: supplyItems,
        supplyItems: supplyItems,
      });
    }

    if (action === "getSupplyItemsAdmin" || action === "supplyItemsAdmin") {
      const supplyItems = getSupplyItemsAdmin();

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: supplyItems.length,
        data: supplyItems,
        supplyItems: supplyItems,
      });
    }
    function getSupplyItemsAdmin() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Supplies");

  if (!sheet) {
    return [];
  }

  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0].map(function (header) {
    return String(header || "").trim();
  });

  const rows = values.slice(1);

  function getValue(row, possibleHeaders) {
    for (var i = 0; i < possibleHeaders.length; i++) {
      const possibleHeader = String(possibleHeaders[i] || "")
        .toLowerCase()
        .trim();

      const index = headers.findIndex(function (header) {
        return String(header || "").toLowerCase().trim() === possibleHeader;
      });

      if (index !== -1) {
        return row[index] || "";
      }
    }

    return "";
  }

  return rows
    .map(function (row, index) {
      const itemName =
        getValue(row, ["Item", "Item Name", "Supply", "Supply Item", "Name"]) ||
        "";

      const description = getValue(row, [
        "Description",
        "Item Description",
        "Details",
        "Notes",
        "Item Notes",
        "Supply Description",
      ]);

      return {
        id:
          getValue(row, ["ID", "Supply ID", "Item ID"]) ||
          "SUP-" + String(index + 2),

        itemName: itemName,
        name: itemName,

        description: description,
        itemDescription: description,
        details: description,
        notes: description,

        category: getValue(row, ["Category", "Type"]),
        unit: getValue(row, ["Unit", "UOM", "Size"]),
        status: getValue(row, ["Status", "Active"]) || "Active",
        rowNumber: index + 2,
      };
    })
    .filter(function (item) {
      return String(item.itemName || item.name || "").trim();
    });
}

function getSupplyOrdersAdmin() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Supply Orders");

  if (!sheet) {
    return {
      success: true,
      supplyOrders: [],
      orders: [],
      message: "Supply Orders sheet not found.",
    };
  }

  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return {
      success: true,
      supplyOrders: [],
      orders: [],
      message: "No supply orders found.",
    };
  }

  const headers = values[0].map(function (header) {
    return String(header || "").trim();
  });

  const rows = values.slice(1);

  const orders = rows
    .map(function (row, index) {
      const order = {};

      headers.forEach(function (header, colIndex) {
        if (!header) return;
        order[header] = row[colIndex];
      });

      const timestamp =
        getSupplyOrderValue(order, ["Timestamp", "Date", "Created At"]) || "";

      const orderId =
        getSupplyOrderValue(order, ["Order ID", "OrderId", "ID", "Id"]) ||
        "ORD-" + (index + 2);

      const subcontractor =
        getSupplyOrderValue(order, [
          "Subcontractor",
          "Subcontractor Name",
          "Company Name",
        ]) || "";

      const subcontractorEmail =
        getSupplyOrderValue(order, [
          "Subcontractor Email",
          "Email",
          "Sub Email",
        ]) || "";

      const accountName =
        getSupplyOrderValue(order, [
          "Account Name",
          "Account",
          "Customer",
        ]) || "";

      const accountId =
        getSupplyOrderValue(order, ["Account ID", "AccountId"]) || "";

      const supplyItem =
        getSupplyOrderValue(order, [
          "Supply Item",
          "Supply",
          "Item",
          "Item Name",
        ]) || "";

      const quantity =
        getSupplyOrderValue(order, ["Quantity", "Qty"]) || "";

      const unit =
        getSupplyOrderValue(order, ["Unit", "Units"]) || "";

      const deliveryMode =
        getSupplyOrderValue(order, [
          "Delivery Mode",
          "Delivery",
          "Pickup/Delivery",
        ]) || "";

      const status =
        getSupplyOrderValue(order, ["Status", "Order Status"]) || "New";

      const notes =
        getSupplyOrderValue(order, ["Notes", "Note", "Comments"]) || "";

      return {
        rowNumber: index + 2,
        timestamp: formatSheetDate(timestamp),
        orderId: String(orderId || ""),
        subcontractor: String(subcontractor || ""),
        subcontractorEmail: String(subcontractorEmail || ""),
        accountName: String(accountName || ""),
        accountId: String(accountId || ""),
        supplyItem: String(supplyItem || ""),
        quantity: String(quantity || ""),
        unit: String(unit || ""),
        deliveryMode: String(deliveryMode || ""),
        status: String(status || "New"),
        notes: String(notes || ""),
        raw: order,
      };
    })
    .filter(function (order) {
      return (
        order.orderId ||
        order.subcontractor ||
        order.accountName ||
        order.supplyItem
      );
    })
    .reverse();

  return {
    success: true,
    supplyOrders: orders,
    orders: orders,
    count: orders.length,
  };
}

function getSupplyOrderValue(order, possibleNames) {
  for (let i = 0; i < possibleNames.length; i++) {
    const name = possibleNames[i];

    if (order[name] !== undefined && order[name] !== null) {
      return order[name];
    }
  }

  return "";
}
function formatSheetDate(value) {
  if (!value) return "";

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "MM/dd/yyyy h:mm a"
    );
  }

  return String(value || "");
}
    if (action === "getSupplyOrders" || action === "supplyOrders") {
      const supplyOrders = getSupplyOrders();

      return jsonResponse({
        success: true,
        actionReceived: action,
        count: supplyOrders.length,
        data: supplyOrders,
        supplyOrders: supplyOrders,
        orders: supplyOrders,
      });
    }
    
    if (action === "testPhotoUpload") {
  return jsonResponse(
    uploadPhotoToDrive({
      accountId: "TEST-ACCOUNT",
      accountName: "Test Account",
      sourceType: "Browser Test",
      sourceId: "TEST-PHOTO",
      uploadedBy: "Browser Test",
      userRole: "admin",
      notes: "Testing photo upload from browser URL.",
      fileName: "test-photo.png",
      mimeType: "image/png",
      base64Data:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
    })
  );
}
if (action === "testSubPortalIssue") {
  return jsonResponse(
    submitSubPortalIssue({
      subcontractorEmail: "test@test.com",
      subcontractorName: "Test Subcontractor",
      accountId: "TEST-ACCOUNT",
      accountName: "Test Account",
      issueType: "Test Issue",
      urgency: "Normal",
      description: "Testing sub portal issue submission from browser.",
      photoCount: "0",
      status: "New"
    })
  );
}
    
  if (
  action === "getSubPortalIssues" ||
  action === "subPortalIssues" ||
  action === "getSubcontractorIssues"
) {
  return jsonResponse(getSubPortalIssues());
} 
if (action === "getSubcontractorActivityLog") {
  const activityLog = getSubcontractorActivityLog();

  return jsonResponse({
    success: true,
    actionReceived: action,
    count: activityLog.length,
    data: activityLog,
    activityLog: activityLog,
  });
}
if (
  action === "getPhotos" ||
  action === "photos" ||
  action === "getComplaintPhotos"
) {
  if (
  action === "getPhotoFile" ||
  action === "photoFile" ||
  action === "getDrivePhotoFile"
) {
  const fileId =
    e && e.parameter && e.parameter.fileId ? e.parameter.fileId : "";

  return jsonResponse(getPhotoFile(fileId));
}
  const photos = getPhotos();

  return jsonResponse({
    success: true,
    actionReceived: action,
    count: photos.length,
    data: photos,
    photos: photos,
  });
} 

    return jsonResponse({
      success: false,
      error: "Unknown GET action: " + action,
      availableActions: [
        "getAccounts",
        "getAllAccounts",
        "getVisits",
        "getComplaints",
        "getAccountUpdates",
        "getSales",
        "getSubcontractors",
        "getSupplyItems",
        "getSupplyItemsAdmin",
        "getSupplyOrders",
        "getSubPortalIssues",
      ],
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: String(error),
    });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const action = body.action;
   
    if (
      action === "getSubcontractorPortalByEmail" ||
      action === "subcontractorPortalLogin"
    ) {
      return jsonResponse(getSubcontractorPortalByEmail(body.email || ""));
    }
    if (action === "logSubcontractorActivity") {
  return jsonResponse(logSubcontractorActivity(body));
}
    if (
    action === "submitSubPortalIssue" ||
    action === "addSubPortalIssue" ||
    action === "createSubPortalIssue"
    ) {
     return jsonResponse(submitSubPortalIssue(body.issue || body));
    }
    if (
    action === "updateSubPortalIssueStatus" ||
    action === "updateSubcontractorIssueStatus" ||
    action === "markSubPortalIssueReviewed"
  ) {
     return jsonResponse(updateSubPortalIssueStatus(body.issue || body));
  }

    if (
      action === "submitSupplyOrder" ||
      action === "addSupplyOrder" ||
      action === "createSupplyOrder"
    ) {
      return jsonResponse(submitSupplyOrder(body.order || body));
    }

    if (
  action === "updateSupplyOrderStatus" ||
  action === "updateSupplyOrder" ||
  action === "editSupplyOrderStatus"
) {
  return jsonResponse(updateSupplyOrderStatus(body.order || body));
}
if (
  action === "uploadPhoto" ||
  action === "uploadPhotoToDrive" ||
  action === "addPhoto"
) {
  return jsonResponse(uploadPhotoToDrive(body.photo || body));
}
    if (
  action === "addSupplyItem" ||
  action === "createSupplyItem"
) {
  return jsonResponse(addSupplyItem(body.supplyItem || body.item || body));
}

if (
  action === "updateSupplyItem" ||
  action === "editSupplyItem"
) {
  return jsonResponse(updateSupplyItem(body.supplyItem || body.item || body));
}

if (
  action === "deleteSupplyItem" ||
  action === "removeSupplyItem" ||
  action === "deactivateSupplyItem"
) {
  return jsonResponse(deactivateSupplyItem(body.supplyItem || body.item || body));
}

    if (action === "addAccount" || action === "createAccount") {
      return jsonResponse(addAccount(body.account || body));
    }

    if (action === "updateAccount" || action === "editAccount") {
      return jsonResponse(updateAccount(body.account || body));
    }

    if (action === "sendNewAccountPacket") {
      return jsonResponse(sendNewAccountPacket(body.account || body));
    }

    if (action === "addVisit" || action === "createVisit") {
      return jsonResponse(addVisit(body.visit || body));
    }

    if (action === "addComplaint" || action === "createComplaint") {
      return jsonResponse(addComplaint(body.complaint || body));
    }

    if (
      action === "updateComplaint" ||
      action === "closeComplaint" ||
      action === "resolveComplaint"
    ) {
      return jsonResponse(updateComplaint(body.complaint || body));
    }
    if (action === "resendComplaintNotification") {
     return jsonResponse(resendComplaintNotification(body.complaint || body));
   }
    if (action === "addToDo") {
  return jsonResponse(addToDo(body));
}

if (action === "updateToDoStatus") {
  return jsonResponse(updateToDoStatus(body));
}
    if (
      action === "addAccountUpdate" ||
      action === "createAccountUpdate" ||
      action === "addUpdate" ||
      action === "createUpdate"
    ) {
      return jsonResponse(
        addAccountUpdate(body.update || body.accountUpdate || body)
      );
    }

    if (action === "addSale" || action === "createSale") {
      return jsonResponse(addSale(body.sale || body));
    }

    if (action === "deleteSale") {
      return jsonResponse(deleteSale(body.sale || body));
    }

    if (
      action === "addSubcontractor" ||
      action === "createSubcontractor" ||
      action === "addSub" ||
      action === "createSub"
    ) {
      return jsonResponse(
        addSubcontractor(body.subcontractor || body.sub || body)
      );
    }

    if (action === "updateSubcontractor" || action === "updateSub") {
      return jsonResponse(
        updateSubcontractor(body.subcontractor || body.sub || body)
      );
    }
    if (
     action === "createSubTransferProposal" ||
     action === "addSubTransferProposal" ||
     action === "saveSubTransferProposal" ||
     action === "saveSubTransferProposalDraft"
    ) {
  return jsonResponse(createSubTransferProposal(body.proposal || body));
}
    if (action === "sendSubTransferProposalEmail") {
  return jsonResponse(sendSubTransferProposalEmail(body.proposal || body));
}
if (
  action === "updateSubTransferProposalStatus" ||
  action === "respondSubTransferProposal"
) {
  const proposalId = String(body.proposalId || "").trim();
  const status = String(body.status || "").trim().toLowerCase();
  const accountName = String(body.accountName || "").trim();

  const params = {
    proposalId: proposalId,
    response: status === "accepted" ? "accepted" : "declined",
    accountName: accountName
  };

  // Reuse existing function but return JSON instead of HTML
  const sheet = getSubTransferProposalSheet();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const idCol = findColumn(headerMap, ["Proposal ID"]);
  const statusCol = findColumn(headerMap, ["Status"]);
  const acceptedAtCol = findColumn(headerMap, ["Accepted At"]);
  const declinedAtCol = findColumn(headerMap, ["Declined At"]);
  const finalStatus = status === "accepted" ? "Accepted" : "Declined";
  const now = new Date();

  for (let i = 1; i < values.length; i++) {
    const rowId = String(values[i][idCol] || "").trim();
    if (rowId === proposalId) {
      if (statusCol !== -1) sheet.getRange(i + 1, statusCol + 1).setValue(finalStatus);
      if (status === "accepted" && acceptedAtCol !== -1) sheet.getRange(i + 1, acceptedAtCol + 1).setValue(now);
      if (status === "declined" && declinedAtCol !== -1) sheet.getRange(i + 1, declinedAtCol + 1).setValue(now);
    }
  }

  return jsonResponse({
    success: true,
    message: "Response recorded: " + finalStatus,
    proposalId: proposalId,
    status: finalStatus
  });
}
    return jsonResponse({
      success: false,
      error: "Unknown POST action: " + action,
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: String(error),
    });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}

const INTERNAL_NOTIFICATION_EMAIL =
  "info@cleaningworldinc.com,crm@cleaningworldinc.com";

const TRANSFER_RESPONSE_NOTIFICATION_EMAILS =
  "info@cleaningworldinc.com,crm@cleaningworldinc.com";

const CLEANING_WORLD_LOGO_URL =
  "https://cleaning-crm-xi.vercel.app/cw-logo.jpg";

function sendInternalNotificationEmail(subject, title, rows) {
  try {
    const rowHtml = rows
      .map(function (row) {
        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#334155;width:170px;">
              ${escapeHtml(row.label)}
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;">
              ${escapeHtml(row.value || "-")}
            </td>
          </tr>
        `;
      })
      .join("");

    const htmlBody = `
      <div style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:680px;margin:0 auto;padding:24px;">
          <div style="background:linear-gradient(135deg,#003b7a 0%,#005bbb 55%,#00a8e8 100%);border-radius:22px;padding:22px;color:white;">
            <div style="display:flex;align-items:center;gap:16px;">
              <div style="background:white;border-radius:16px;padding:10px;width:130px;height:70px;display:flex;align-items:center;justify-content:center;">
                <img src="${CLEANING_WORLD_LOGO_URL}" alt="Cleaning World" style="max-width:100%;max-height:100%;object-fit:contain;" />
              </div>
              <div>
                <div style="font-size:24px;font-weight:900;line-height:1;">Cleaning World</div>
                <div style="font-size:13px;font-weight:700;margin-top:6px;color:rgba(255,255,255,0.9);">
                  Operations & Quality Notification
                </div>
              </div>
            </div>
          </div>

          <div style="background:white;border-radius:22px;margin-top:18px;padding:22px;border:1px solid #dbeafe;">
            <h2 style="margin:0 0 14px;font-size:22px;color:#003b7a;">
              ${escapeHtml(title)}
            </h2>

            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              ${rowHtml}
            </table>

            <p style="margin:22px 0 0;font-size:12px;color:#64748b;">
              This is an automatic internal notification from the Cleaning World Operations & Quality Management System.
            </p>
          </div>
        </div>
      </div>
    `;

    const plainBody =
      title +
      "\n\n" +
      rows
        .map(function (row) {
          return row.label + ": " + (row.value || "-");
        })
        .join("\n");

    sendLoggedEmail({
      to: INTERNAL_NOTIFICATION_EMAIL,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: "Cleaning World App",
      emailType: "Internal Notification",
      accountName: "",
      accountId: "",
      relatedId: "",
      triggeredBy: "System",
      source: "Apps Script - sendInternalNotificationEmail",
      notes: title || "Internal notification sent."
    });

    return true;
  } catch (error) {
    console.log("Notification email failed: " + String(error));
    return false;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function testInternalNotificationEmail() {
  sendInternalNotificationEmail(
    "Cleaning World Test Notification",
    "Test Notification",
    [
      { label: "Status", value: "Email notification system is working." },
      { label: "Sent To", value: INTERNAL_NOTIFICATION_EMAIL },
    ]
  );
}

function forceMailAuthorization() {
  MailApp.sendEmail(
    "info@cleaningworldinc.com",
    "Cleaning World MailApp Authorization Test",
    "This is a direct test to authorize MailApp for the Cleaning World app."
  );
}

function sendNewAccountPacket(body) {
  const accountName = String(body.accountName || "").trim();
  let subcontractorName = String(body.subcontractor || body.subcontractorName || "").trim();
  let subcontractorEmail = String(body.subcontractorEmail || "").trim();

  if (!accountName) throw new Error("Missing account name.");
  if (!subcontractorName) throw new Error("Missing subcontractor name.");

  if (!subcontractorEmail) {
    subcontractorEmail = findSubcontractorEmailByName(subcontractorName);
  }

  if (!subcontractorEmail) {
    console.log("⚠️ Could not find email for subcontractor: " + subcontractorName);
    throw new Error("Could not find subcontractor email for: " + subcontractorName);
  }

  const address = String(body.address || "").trim();
  const startDate = String(body.startDate || "").trim();
  const cleaningSchedule = String(body.cleaningSchedule || "").trim();
  const monthlySubcontractorPay = String(
    body.monthlySubcontractorPay || body.subcontractorPay || ""
  ).trim();

  const hasKey = String(body.hasKey || "").trim();
  const alarmInfo = String(body.alarmInfo || body.alarmCode || "").trim();
  const scope = String(body.scope || body.scopeOfWork || body.notes || "").trim();
  const manager = String(body.manager || "").trim();

  const subject = "New Account Assigned - " + accountName;

  function row(label, value, valueColor) {
    return `
      <tr>
        <td style="padding:13px 16px;border-bottom:1px solid #eef2f7;font-weight:700;color:#334155;width:200px;font-size:13px;letter-spacing:0.2px;">
          ${escapeHtml(label)}
        </td>
        <td style="padding:13px 16px;border-bottom:1px solid #eef2f7;color:${valueColor || "#0f172a"};font-size:14px;white-space:pre-wrap;">
          ${escapeHtml(value)}
        </td>
      </tr>
    `;
  }

  const alarmRow = alarmInfo
    ? row("Alarm Info", alarmInfo, "#b45309")
    : "";

  const htmlBody = `
    <div style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;padding:28px 20px;">

        <div style="background:linear-gradient(135deg,#003b7a 0%,#005bbb 55%,#00a8e8 100%);border-radius:20px 20px 0 0;padding:26px 28px;color:white;">
          <div style="display:flex;align-items:center;gap:16px;">
            <div style="background:white;border-radius:14px;padding:8px;width:110px;height:60px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <img src="${CLEANING_WORLD_LOGO_URL}" alt="Cleaning World" style="max-width:100%;max-height:100%;object-fit:contain;" />
            </div>
            <div>
              <div style="font-size:21px;font-weight:900;line-height:1.1;letter-spacing:0.3px;">CLEANING WORLD INC.</div>
              <div style="font-size:12px;font-weight:700;margin-top:5px;color:rgba(255,255,255,0.88);text-transform:uppercase;letter-spacing:0.6px;">
                New Account Assignment Packet
              </div>
            </div>
          </div>
        </div>

        <div style="background:white;padding:26px 28px;border-left:1px solid #dbeafe;border-right:1px solid #dbeafe;">
          <h2 style="margin:0 0 6px;font-size:20px;color:#003b7a;">
            New Account Assigned
          </h2>
          <p style="margin:0 0 20px;font-size:13px;color:#64748b;line-height:1.5;">
            Please review the account details below. Price shown is monthly.
          </p>

          <table style="width:100%;border-collapse:collapse;border:1px solid #eef2f7;border-radius:10px;overflow:hidden;">
            ${row("Account Name", accountName)}
            ${row("Address", address || "-")}
            ${row("Start Date", startDate || "-")}
            ${row("Cleaning Schedule", cleaningSchedule || "-")}
            ${row("Monthly Subcontractor Pay", monthlySubcontractorPay ? "$" + monthlySubcontractorPay : "-", "#166534")}
            ${row("Key", hasKey || "No / Not provided")}
            ${alarmRow}
            ${row("Scope / Notes", scope || "-")}
            ${row("Cleaning World Contact", manager || "Cleaning World Office")}
          </table>
        </div>

        <div style="background:#f8fafc;border:1px solid #dbeafe;border-top:none;border-radius:0 0 20px 20px;padding:18px 28px;">
          <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
            <strong style="color:#334155;">Cleaning World Inc.</strong> · 90 Burlews Ct, Hackensack, NJ 07601 · 201-487-1313<br>
            This is an automatic notification from the Cleaning World Operations & Quality Management System.
          </p>
        </div>

      </div>
    </div>
  `;

  const plainBody =
    "New Account Assigned\n\n" +
    "Account Name: " + accountName +
    "\nAddress: " + (address || "-") +
    "\nStart Date: " + (startDate || "-") +
    "\nCleaning Schedule: " + (cleaningSchedule || "-") +
    "\nMonthly Subcontractor Pay: " + (monthlySubcontractorPay || "-") +
    "\nPrice shown is monthly.\n" +
    "Key: " + (hasKey || "No / Not provided") +
    "\n" + (alarmInfo ? "Alarm Info: " + alarmInfo + "\n" : "") +
    "Scope / Notes: " + (scope || "-") +
    "\nCleaning World Contact: " + (manager || "Cleaning World Office") +
    "\n\nCleaning World Inc. · 90 Burlews Ct, Hackensack, NJ 07601 · 201-487-1313";

  try {
    MailApp.sendEmail({
      to: subcontractorEmail,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: "Cleaning World App",
    });

    logEmailEvent({
      accountName: accountName,
      accountId: body.accountId || body.id || "",
      emailType: "New Account Packet",
      sentTo: subcontractorEmail,
      subject: subject,
      status: "Sent",
      relatedId: body.accountId || body.id || accountName,
      triggeredBy: body.triggeredBy || "System",
      userRole: body.userRole || "",
      source: "Apps Script - sendNewAccountPacket",
      notes: "New account assignment packet sent to subcontractor."
    });

    return {
      success: true,
      message: "New account packet sent to " + subcontractorEmail + ".",
      sentTo: subcontractorEmail,
      accountName: accountName,
    };
  } catch (error) {
    logEmailEvent({
      accountName: accountName,
      accountId: body.accountId || body.id || "",
      emailType: "New Account Packet",
      sentTo: subcontractorEmail,
      subject: subject,
      status: "Failed",
      relatedId: body.accountId || body.id || accountName,
      triggeredBy: body.triggeredBy || "System",
      userRole: body.userRole || "",
      source: "Apps Script - sendNewAccountPacket",
      notes: String(error)
    });

    throw error;
  }
}
function sendNewAccountAddedEmail(body, accountId, monthlyRevenue, monthlySubcontractorPay) {
  const accountName = String(body.accountName || "Cleaning World").trim();
  const subject = "New Account Added - " + accountName;

  function row(label, value, valueColor) {
    return `
      <tr>
        <td style="padding:11px 16px;border-bottom:1px solid #eef2f7;font-weight:700;color:#334155;width:190px;font-size:13px;">
          ${escapeHtml(label)}
        </td>
        <td style="padding:11px 16px;border-bottom:1px solid #eef2f7;color:${valueColor || "#0f172a"};font-size:14px;white-space:pre-wrap;">
          ${escapeHtml(value || "-")}
        </td>
      </tr>
    `;
  }

  const htmlBody = `
    <div style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;padding:28px 20px;">

        <div style="background:linear-gradient(135deg,#003b7a 0%,#005bbb 55%,#00a8e8 100%);border-radius:20px 20px 0 0;padding:26px 28px;color:white;">
          <div style="display:flex;align-items:center;gap:16px;">
            <div style="background:white;border-radius:14px;padding:8px;width:110px;height:60px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <img src="${CLEANING_WORLD_LOGO_URL}" alt="Cleaning World" style="max-width:100%;max-height:100%;object-fit:contain;" />
            </div>
            <div>
              <div style="font-size:21px;font-weight:900;line-height:1.1;letter-spacing:0.3px;">CLEANING WORLD INC.</div>
              <div style="font-size:12px;font-weight:700;margin-top:5px;color:rgba(255,255,255,0.88);text-transform:uppercase;letter-spacing:0.6px;">
                Operations &amp; Quality Notification
              </div>
            </div>
          </div>
        </div>

        <div style="background:white;padding:26px 28px;border-left:1px solid #dbeafe;border-right:1px solid #dbeafe;">
          <h2 style="margin:0 0 18px;font-size:20px;color:#003b7a;">
            New Account Added
          </h2>

          <table style="width:100%;border-collapse:collapse;border:1px solid #eef2f7;border-radius:10px;overflow:hidden;">
            ${row("Account", body.accountName)}
            ${row("Address", body.address)}
            ${row("City", body.city)}
            ${row("State", body.state)}
            ${row("Zip", body.zip)}
            ${row("Manager", body.manager)}
            ${row("Subcontractor", body.subcontractor)}
            ${row("Status", body.status || "Active")}
            ${row("Account Start Date", body.accountStartDate || body.startDate)}
            ${row("Monthly Revenue", monthlyRevenue ? "$" + monthlyRevenue : "", "#166534")}
            ${row("Monthly Subcontractor Pay", monthlySubcontractorPay ? "$" + monthlySubcontractorPay : "", "#166534")}
            ${row("Gross Margin", body.grossMargin)}
            ${row("Gross Margin %", body.grossMarginPercent)}
            ${row("Has Key", body.hasKey)}
            ${row("Alarm Code", body.alarmCode, body.alarmCode ? "#b45309" : undefined)}
            ${row("Access Info", body.keyAlarmAccessInfo)}
            ${row("Contact Name", body.contactName)}
            ${row("Phone", body.phone)}
            ${row("Email", body.email)}
            ${row("Service Type", body.serviceType)}
            ${row("Frequency", body.frequency)}
            ${row("Cleaning Days", body.cleaningDays)}
            ${row("Notes", body.notes)}
          </table>
        </div>

        <div style="background:#f8fafc;border:1px solid #dbeafe;border-top:none;border-radius:0 0 20px 20px;padding:18px 28px;">
          <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
            <strong style="color:#334155;">Cleaning World Inc.</strong> · 90 Burlews Ct, Hackensack, NJ 07601 · 201-487-1313<br>
            This is an automatic notification from the Cleaning World Operations &amp; Quality Management System.
          </p>
        </div>

      </div>
    </div>
  `;

  const plainBody =
    "New Account Added\n\n" +
    "Account: " + (body.accountName || "-") +
    "\nAddress: " + (body.address || "-") +
    "\nCity: " + (body.city || "-") +
    "\nState: " + (body.state || "-") +
    "\nZip: " + (body.zip || "-") +
    "\nManager: " + (body.manager || "-") +
    "\nSubcontractor: " + (body.subcontractor || "-") +
    "\nStatus: " + (body.status || "Active") +
    "\nAccount Start Date: " + (body.accountStartDate || body.startDate || "-") +
    "\nMonthly Revenue: " + (monthlyRevenue || "-") +
    "\nMonthly Subcontractor Pay: " + (monthlySubcontractorPay || "-") +
    "\nGross Margin: " + (body.grossMargin || "-") +
    "\nGross Margin %: " + (body.grossMarginPercent || "-") +
    "\nHas Key: " + (body.hasKey || "-") +
    "\nAlarm Code: " + (body.alarmCode || "-") +
    "\nAccess Info: " + (body.keyAlarmAccessInfo || "-") +
    "\nContact Name: " + (body.contactName || "-") +
    "\nPhone: " + (body.phone || "-") +
    "\nEmail: " + (body.email || "-") +
    "\nService Type: " + (body.serviceType || "-") +
    "\nFrequency: " + (body.frequency || "-") +
    "\nCleaning Days: " + (body.cleaningDays || "-") +
    "\nNotes: " + (body.notes || "-") +
    "\n\nCleaning World Inc. · 90 Burlews Ct, Hackensack, NJ 07601 · 201-487-1313";

  try {
    MailApp.sendEmail({
      to: INTERNAL_NOTIFICATION_EMAIL,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: "Cleaning World App",
    });

    logEmailEvent({
      accountName: accountName,
      accountId: accountId || "",
      emailType: "Internal Notification",
      sentTo: INTERNAL_NOTIFICATION_EMAIL,
      subject: subject,
      status: "Sent",
      relatedId: accountId || "",
      triggeredBy: "System",
      userRole: "",
      source: "Apps Script - sendNewAccountAddedEmail",
      notes: "New Account Added"
    });

    return true;
  } catch (error) {
    logEmailEvent({
      accountName: accountName,
      accountId: accountId || "",
      emailType: "Internal Notification",
      sentTo: INTERNAL_NOTIFICATION_EMAIL,
      subject: subject,
      status: "Failed",
      relatedId: accountId || "",
      triggeredBy: "System",
      userRole: "",
      source: "Apps Script - sendNewAccountAddedEmail",
      notes: String(error)
    });

    console.log("New Account Added email failed: " + String(error));
    return false;
  }
}

function findSubcontractorEmailByName(subcontractorName) {
  try {
    const nameToFind = normalizeMatchValue(subcontractorName);

    if (!nameToFind) {
      console.log("No subcontractor name provided.");
      return "";
    }

    const sheet = getSubcontractorsSheet();
    const values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      console.log("Subcontractor sheet has no data.");
      return "";
    }

    const headers = values[0];
    const headerMap = getHeaderMap(headers);

    const companyNameCol = findColumn(headerMap, [
      "Company Name",
      "Company",
      "Subcontractor",
      "Subcontractor Name",
      "Sub Contractor",
      "Sub Contractor Name",
      "Sub Name",
      "Name",
      "Cleaner",
      "Sub",
    ]);

    const contactNameCol = findColumn(headerMap, [
      "Contact Name",
      "Contact",
      "Owner",
      "Main Contact",
      "Name",
    ]);

    const emailCol = findColumn(headerMap, [
      "Email",
      "Email Address",
      "Subcontractor Email",
      "Sub Contractor Email",
      "Cleaner Email",
    ]);

    if (emailCol === -1) {
      console.log("No subcontractor email column found.");
      return "";
    }

    if (companyNameCol === -1 && contactNameCol === -1) {
      console.log("No subcontractor name/contact column found.");
      return "";
    }

    // Exact match first
    for (let r = 1; r < values.length; r++) {
      const companyName =
        companyNameCol !== -1 ? normalizeMatchValue(values[r][companyNameCol]) : "";

      const contactName =
        contactNameCol !== -1 ? normalizeMatchValue(values[r][contactNameCol]) : "";

      const email = String(values[r][emailCol] || "").trim();

      if (!email) continue;

      if (companyName && companyName === nameToFind) {
        return email;
      }

      if (contactName && contactName === nameToFind) {
        return email;
      }
    }

    // Soft match second
    for (let r = 1; r < values.length; r++) {
      const companyName =
        companyNameCol !== -1 ? normalizeMatchValue(values[r][companyNameCol]) : "";

      const contactName =
        contactNameCol !== -1 ? normalizeMatchValue(values[r][contactNameCol]) : "";

      const email = String(values[r][emailCol] || "").trim();

      if (!email) continue;

      if (
        companyName &&
        (companyName.indexOf(nameToFind) !== -1 ||
          nameToFind.indexOf(companyName) !== -1)
      ) {
        return email;
      }

      if (
        contactName &&
        (contactName.indexOf(nameToFind) !== -1 ||
          nameToFind.indexOf(contactName) !== -1)
      ) {
        return email;
      }
    }

    console.log("No email match found for subcontractor: " + subcontractorName);
    return "";
  } catch (error) {
    console.log("findSubcontractorEmailByName failed: " + String(error));
    return "";
  }
}
/* =========================================================
   PHOTOS
========================================================= */
function ensureSubPortalIssuesSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("Sub Portal Issues");

  if (!sheet) {
    sheet = ss.insertSheet("Sub Portal Issues");
  }

  var headers = [
    "Timestamp",
    "Issue ID",
    "Subcontractor Email",
    "Subcontractor Name",
    "Account ID",
    "Account Name",
    "Issue Type",
    "Urgency",
    "Description",
    "Photo Count",
    "Status",
    "Notes",
  ];

  var currentHeaders = sheet
    .getRange(1, 1, 1, headers.length)
    .getValues()[0];

  var needsHeaders = currentHeaders.every(function (value) {
    return !value;
  });

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}
function ensureSubcontractorActivityLogSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("Subcontractor Activity Log");

  if (!sheet) {
    sheet = ss.insertSheet("Subcontractor Activity Log");
  }

  var headers = [
    "Timestamp",
    "Subcontractor Email",
    "Subcontractor Name",
    "Action Type",
    "Details",
  ];

  var currentHeaders = sheet
    .getRange(1, 1, 1, headers.length)
    .getValues()[0];

  var needsHeaders = currentHeaders.every(function (value) {
    return !value;
  });

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function logSubcontractorActivity(body) {
  try {
    var sheet = ensureSubcontractorActivityLogSheet_();

    var subcontractorEmail = String(body.subcontractorEmail || "").trim();
    var subcontractorName = String(body.subcontractorName || "").trim();
    var actionType = String(body.actionType || "").trim();
    var details = String(body.details || "").trim();

    sheet.appendRow([
      new Date(),
      subcontractorEmail,
      subcontractorName,
      actionType,
      details,
    ]);

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
function getSubcontractorActivityLog() {
  var sheet = ensureSubcontractorActivityLogSheet_();
  var values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  var headers = values[0];
  var headerMap = getHeaderMap(headers);
  var rows = values.slice(1);

  return rows
    .filter(function (row) {
      return row.join("").trim() !== "";
    })
    .map(function (row) {
      return {
        timestamp: formatDateForApp(
          getCell(row, headerMap, ["Timestamp"])
        ),
        subcontractorEmail: String(
          getCell(row, headerMap, ["Subcontractor Email"]) || ""
        ),
        subcontractorName: String(
          getCell(row, headerMap, ["Subcontractor Name"]) || ""
        ),
        actionType: String(
          getCell(row, headerMap, ["Action Type"]) || ""
        ),
        details: String(
          getCell(row, headerMap, ["Details"]) || ""
        ),
      };
    })
    .reverse();
}

function submitSubPortalIssue(body) {
  var sheet = ensureSubPortalIssuesSheet_();

  var issueId = generateId("SUBISSUE");

  var subcontractorEmail = String(body.subcontractorEmail || "").trim();
  var subcontractorName = String(body.subcontractorName || "").trim();
  var accountId = String(body.accountId || "").trim();
  var accountName = String(body.accountName || "").trim();
  var issueType = String(body.issueType || "Other").trim();
  var urgency = String(body.urgency || "Normal").trim();
  var description = String(body.description || "").trim();
  var photoCount = String(body.photoCount || "0").trim();
  var status = String(body.status || "New").trim();

  if (!subcontractorEmail && !subcontractorName) {
    throw new Error("Missing subcontractor information.");
  }

  if (!accountName) {
    throw new Error("Missing account name.");
  }

  if (!description) {
    throw new Error("Missing issue description.");
  }

  sheet.appendRow([
    new Date(),
    issueId,
    subcontractorEmail,
    subcontractorName,
    accountId,
    accountName,
    issueType,
    urgency,
    description,
    photoCount,
    status,
    "",
  ]);

  try {
    sendInternalNotificationEmail(
      "Subcontractor Reported Issue - " + accountName,
      "Subcontractor Reported Issue",
      [
        { label: "Issue ID", value: issueId },
        { label: "Account", value: accountName },
        { label: "Issue Type", value: issueType },
        { label: "Urgency", value: urgency },
        { label: "Subcontractor", value: subcontractorName },
        { label: "Subcontractor Email", value: subcontractorEmail },
        { label: "Description", value: description },
        { label: "Photo Count", value: photoCount },
      ]
    );
  } catch (error) {
    Logger.log("Sub portal issue email failed: " + String(error));
  }

  return {
    success: true,
    message: "Issue submitted successfully.",
    issueId: issueId,
  };
}

function ensurePhotosSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("Photos");

  if (!sheet) {
    sheet = ss.insertSheet("Photos");
  }

  var headers = [
    "Timestamp",
    "Photo ID",
    "Account ID",
    "Account Name",
    "Source Type",
    "Source ID",
    "Uploaded By",
    "User Role",
    "File Name",
    "Drive File ID",
    "Drive URL",
    "Folder URL",
    "Notes",
    "Status",
  ];

  var currentHeaders = sheet
    .getRange(1, 1, 1, headers.length)
    .getValues()[0];

  var needsHeaders = currentHeaders.every(function (value) {
    return !value;
  });

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function testEnsurePhotosSheet() {
  var sheet = ensurePhotosSheet_();
  Logger.log("Photos sheet ready: " + sheet.getName());
}
function getOrCreateCwoPhotosFolder_() {
  var folderName = "CWO Photos";
  var folders = DriveApp.getFoldersByName(folderName);

  if (folders.hasNext()) {
    return folders.next();
  }

  return DriveApp.createFolder(folderName);
}

function cleanDriveFolderName_(value) {
  return String(value || "Unknown")
    .replace(/[\\\/\?\*\[\]\:]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 120);
}

function getOrCreateChildFolder_(parentFolder, folderName) {
  var cleanName = cleanDriveFolderName_(folderName);
  var folders = parentFolder.getFoldersByName(cleanName);

  if (folders.hasNext()) {
    return folders.next();
  }

  return parentFolder.createFolder(cleanName);
}

function getOrCreateAccountPhotoFolder_(accountName, accountId) {
  var rootFolder = getOrCreateCwoPhotosFolder_();

  var safeAccountName = cleanDriveFolderName_(accountName || "Unknown Account");
  var safeAccountId = cleanDriveFolderName_(accountId || "No ID");

  var accountFolderName = safeAccountName + " - " + safeAccountId;

  return getOrCreateChildFolder_(rootFolder, accountFolderName);
}

function getOrCreateSourcePhotoFolder_(accountName, accountId, sourceType, sourceId) {
  var accountFolder = getOrCreateAccountPhotoFolder_(accountName, accountId);

  var safeSourceType = cleanDriveFolderName_(sourceType || "General");
  var safeSourceId = cleanDriveFolderName_(sourceId || generateId("PHOTO-SOURCE"));

  var sourceFolderName = safeSourceType + " - " + safeSourceId;

  return getOrCreateChildFolder_(accountFolder, sourceFolderName);
}

function testCreateCwoPhotosFolder() {
  var rootFolder = getOrCreateCwoPhotosFolder_();

  Logger.log("Root folder name: " + rootFolder.getName());
  Logger.log("Root folder URL: " + rootFolder.getUrl());

  var testFolder = getOrCreateSourcePhotoFolder_(
    "Test Account",
    "ACCT-TEST",
    "Complaint",
    "COMP-TEST"
  );

  Logger.log("Test folder name: " + testFolder.getName());
  Logger.log("Test folder URL: " + testFolder.getUrl());
}
function uploadPhotoToDrive(body) {
  var accountId = String(body.accountId || "").trim();
  var accountName = String(body.accountName || "").trim();
  var sourceType = String(body.sourceType || "General").trim();
  var sourceId = String(body.sourceId || "").trim();
  var uploadedBy = String(body.uploadedBy || "").trim();
  var userRole = String(body.userRole || "").trim();
  var notes = String(body.notes || "").trim();

  var fileName = String(body.fileName || "photo.jpg").trim();
  var mimeType = String(body.mimeType || "image/jpeg").trim();
  var base64Data = String(body.base64Data || body.data || "").trim();

  if (!accountName && !accountId) {
    throw new Error("Missing account name or account ID.");
  }

  if (!base64Data) {
    throw new Error("Missing photo data.");
  }

  var photoId = generateId("PHOTO");

  var cleanFileName =
    photoId + " - " + cleanDriveFolderName_(fileName || "photo.jpg");

  var folder = getOrCreateSourcePhotoFolder_(
    accountName,
    accountId,
    sourceType,
    sourceId || photoId
  );

  var decodedBytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decodedBytes, mimeType, cleanFileName);

  var file = folder.createFile(blob);

  try {
    file.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.VIEW
    );
  } catch (error) {
    Logger.log("Could not set file sharing: " + String(error));
  }

  var sheet = ensurePhotosSheet_();

  sheet.appendRow([
    new Date(),
    photoId,
    accountId,
    accountName,
    sourceType,
    sourceId,
    uploadedBy,
    userRole,
    cleanFileName,
    file.getId(),
    file.getUrl(),
    folder.getUrl(),
    notes,
    "Active",
  ]);

  if (sourceType === "Sub Portal Issue") {
  try {
    sendInternalNotificationEmail(
      "Photo Uploaded for Sub Portal Issue - " + accountName,
      "Photo Uploaded for Sub Portal Issue",
      [
        { label: "Photo ID", value: photoId },
        { label: "Issue ID", value: sourceId },
        { label: "Account", value: accountName },
        { label: "Account ID", value: accountId },
        { label: "Uploaded By", value: uploadedBy },
        { label: "User Role", value: userRole },
        { label: "File Name", value: cleanFileName },
        { label: "Photo Link", value: file.getUrl() },
        { label: "Folder Link", value: folder.getUrl() },
        { label: "Notes", value: notes },
      ]
    );
  } catch (error) {
    Logger.log("Sub portal issue photo notification failed: " + String(error));
  }
}

  return {
  success: true,
  message: "Photo uploaded successfully and saved for admin notification.",
  photoId: photoId,
  accountId: accountId,
  accountName: accountName,
  sourceType: sourceType,
  sourceId: sourceId,
  fileName: cleanFileName,
  driveFileId: file.getId(),
  driveUrl: file.getUrl(),
  folderUrl: folder.getUrl(),
};
}

/* =========================================================
   BASIC HELPERS
========================================================= */

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheetByPossibleNames(possibleNames) {
  const ss = getSpreadsheet();

  for (let i = 0; i < possibleNames.length; i++) {
    const sheet = ss.getSheetByName(possibleNames[i]);
    if (sheet) return sheet;
  }

  throw new Error("Could not find sheet tab. Tried: " + possibleNames.join(", "));
}

function normalizeHeader(header) {
  return String(header || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/-/g, "")
    .replace(/\./g, "")
    .replace(/\#/g, "")
    .replace(/\//g, "")
    .trim();
}

function getHeaderMap(headers) {
  const map = {};

  headers.forEach(function (header, index) {
    map[normalizeHeader(header)] = index;
  });

  return map;
}

function findColumn(headerMap, possibleNames) {
  for (let i = 0; i < possibleNames.length; i++) {
    const key = normalizeHeader(possibleNames[i]);

    if (headerMap[key] !== undefined) {
      return headerMap[key];
    }
  }

  return -1;
}

function getCell(row, headerMap, possibleNames) {
  const col = findColumn(headerMap, possibleNames);
  if (col === -1) return "";
  return row[col] || "";
}

function setCell(row, headerMap, possibleNames, value) {
  const col = findColumn(headerMap, possibleNames);
  if (col === -1) return;
  row[col] = value;
}

function generateId(prefix) {
  const now = new Date();
  const stamp = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "yyyyMMddHHmmss"
  );

  return prefix + "-" + stamp;
}

function formatDateForApp(value) {
  if (!value) return "";

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );
  }

  return String(value);
}

function normalizeMatchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function roundToOne(value) {
  return Math.round(Number(value) * 10) / 10;
}

function parseMoneyForAppsScript(value) {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    return isNaN(value) ? 0 : value;
  }

  const cleaned = String(value)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d.-]/g, "");

  const parsed = Number(cleaned);

  return isNaN(parsed) ? 0 : parsed;
}

function pickFirstValue(values) {
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== undefined && values[i] !== null && values[i] !== "") {
      return values[i];
    }
  }

  return "";
}

function normalizeAccountKeyForAppsScript(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\bllc\b/g, "")
    .replace(/\binc\b/g, "")
    .replace(/\bcorp\b/g, "")
    .replace(/\bcorporation\b/g, "")
    .replace(/\bcompany\b/g, "")
    .replace(/\bco\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function normalizeAddressKeyForAppsScript(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bplace\b/g, "pl")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\bsuite\b/g, "ste")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function isBadAccountStatusForAppsScript(status) {
  const cleanStatus = String(status || "").toLowerCase().trim();

  if (!cleanStatus) return false;

  const badStatuses = [
    "cancelled",
    "canceled",
    "inactive",
    "paused",
    "lost",
    "terminated",
    "closed",
    "duplicate",
    "old",
    "archive",
    "archived",
  ];

  return badStatuses.some(function (badStatus) {
    return cleanStatus.indexOf(badStatus) !== -1;
  });
}

/* =========================================================
   OPTIONAL GENERIC SHEET READER
========================================================= */

function getOptionalSheetRows(possibleNames) {
  try {
    const sheet = getSheetByPossibleNames(possibleNames);
    const values = sheet.getDataRange().getValues();

    if (values.length < 2) return [];

    const headers = values[0];
    const rows = values.slice(1);

    return rows
      .filter(function (row) {
        return row.join("").trim() !== "";
      })
      .map(function (row) {
        const item = {};

        headers.forEach(function (header, index) {
          const key = String(header || "")
            .trim()
            .replace(/\s+(.)/g, function (_, character) {
              return character.toUpperCase();
            })
            .replace(/\s/g, "")
            .replace(/^./, function (character) {
              return character.toLowerCase();
            });

          item[key || "column" + index] = row[index] || "";
        });

        return item;
      });
  } catch (error) {
    return [];
  }
}

/* =========================================================
   SHEET TAB HELPERS
========================================================= */

function getAccountsSheet() {
  return getSheetByPossibleNames([
    "Accounts",
    "All Accounts",
    "Account",
    "All Account",
  ]);
}

function getVisitsSheet() {
  return getSheetByPossibleNames(["Visits", "Account Visits", "Visit"]);
}

function getComplaintsSheet() {
  return getSheetByPossibleNames(["Complaints", "Complaint"]);
}

function getSupplyOrdersSheet() {
  return getSheetByPossibleNames([
    "Supply Orders",
    "SupplyOrders",
    "Supplies Orders",
    "Supply Order",
    "Orders",
  ]);
}

function getSuppliesSheet() {
  return getSheetByPossibleNames([
    "Supplies",
    "Supply Items",
    "SupplyItems",
    "Inventory",
    "Items",
  ]);
}

function getAccountUpdatesSheet() {
  const ss = getSpreadsheet();
  const sheets = ss.getSheets();

  const allowedNames = [
    "accountupdate",
    "accountupdates",
    "accountnews",
    "updates",
    "news",
  ];

  for (let i = 0; i < sheets.length; i++) {
    const sheetName = sheets[i].getName();

    const normalizedName = String(sheetName || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "")
      .replace(/-/g, "")
      .replace(/\./g, "")
      .trim();

    if (allowedNames.indexOf(normalizedName) !== -1) {
      return sheets[i];
    }
  }

  throw new Error(
    "Could not find Account Updates tab. Tried normalized names: " +
      allowedNames.join(", ")
  );
}

function getSalesSheet() {
  return getSheetByPossibleNames([
    "Sales",
    "Sales & Commissions",
    "Sales and Commissions",
    "Commissions",
  ]);
}

function getSubcontractorsSheet() {
  return getSheetByPossibleNames([
    "Subcontractors",
    "Sub Contractors",
    "SubContractors",
    "Subs",
  ]);
}

/* =========================================================
   ACCOUNTS
========================================================= */

function getAccounts() {
  const sheet = getAccountsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const rows = values.slice(1);

  const rawAccounts = rows
    .map(function (row, index) {
      const accountName = String(
        getCell(row, headerMap, [
          "Account Name",
          "Account",
          "Name",
          "Customer",
        ]) || ""
      ).trim();

      const address = String(
        getCell(row, headerMap, [
          "Address",
          "Full Address",
          "Service Address",
        ]) || ""
      ).trim();

      const city = String(getCell(row, headerMap, ["City"]) || "").trim();
      const state = String(getCell(row, headerMap, ["State"]) || "").trim();
      const zip = String(
        getCell(row, headerMap, ["Zip", "Zip Code"]) || ""
      ).trim();

      const status = String(
        getCell(row, headerMap, ["Status", "Account Status"]) || ""
      ).trim();

      const monthlyRevenue = String(
        getCell(row, headerMap, [
          "Monthly Revenue",
          "What Cleaning World Gets Paid",
          "Cleaning World Gets Paid",
          "Monthly Billing",
        ]) || ""
      ).trim();

      const subcontractorPay = String(
        getCell(row, headerMap, [
          "Monthly Subcontractor Pay",
          "Monthly Sub Pay",
          "Subcontractor Pay",
          "Sub Pay",
          "Cleaner Pay",
        ]) || ""
      ).trim();

      return {
        rowNumber: index + 2,
        id: String(
          getCell(row, headerMap, ["ID", "Account ID", "Id"]) || ""
        ).trim(),
        accountId: String(
          getCell(row, headerMap, ["ID", "Account ID", "Id"]) || ""
        ).trim(),
        accountName: accountName,
        address: address,
        city: city,
        state: state,
        zip: zip,
                latitude: String(
          getCell(row, headerMap, ["Latitude", "Lat"]) || ""
        ).trim(),
        longitude: String(
          getCell(row, headerMap, ["Longitude", "Lng", "Long"]) || ""
        ).trim(),
        Latitude: String(
          getCell(row, headerMap, ["Latitude", "Lat"]) || ""
        ).trim(),
        Longitude: String(
          getCell(row, headerMap, ["Longitude", "Lng", "Long"]) || ""
        ).trim(),
        manager: String(
          getCell(row, headerMap, ["Manager", "Account Manager"]) || ""
        ).trim(),
        subcontractor: String(
          getCell(row, headerMap, [
            "Subcontractor",
            "Sub Contractor",
            "Cleaner",
            "Sub",
            "Sub Name",
          ]) || ""
        ).trim(),
        status: status,
        accountHealth: String(
          getCell(row, headerMap, ["Account Health", "Health", "Score"]) || ""
        ).trim(),
        accountStartDate: formatDateForApp(
          getCell(row, headerMap, [
            "Account Start Date",
            "Start Date",
            "StartDate",
          ])
        ),
        monthlyRevenue: monthlyRevenue,
        monthlySubcontractorPay: subcontractorPay,
        subcontractorPay: subcontractorPay,
        grossMargin: String(
          getCell(row, headerMap, ["Gross Margin", "Margin"]) || ""
        ).trim(),
        grossMarginPercent: String(
          getCell(row, headerMap, [
            "Gross Margin %",
            "Margin %",
            "Gross Margin Percent",
          ]) || ""
        ).trim(),
        hasKey: String(
          getCell(row, headerMap, ["Has Key", "Key", "Keys"]) || ""
        ).trim(),
        alarmCode: String(
          getCell(row, headerMap, ["Alarm Code", "Alarm", "Code"]) || ""
        ).trim(),
        keyAlarmAccessInfo: String(
          getCell(row, headerMap, [
            "Key Alarm Access Info",
            "Key/Alarm Access Info",
            "Access Info",
          ]) || ""
        ).trim(),
        contactName: String(
          getCell(row, headerMap, ["Contact Name", "Contact"]) || ""
        ).trim(),
        phone: String(
          getCell(row, headerMap, ["Phone", "Phone Number"]) || ""
        ).trim(),
        email: String(
          getCell(row, headerMap, ["Email", "Email Address"]) || ""
        ).trim(),
        serviceType: String(
          getCell(row, headerMap, ["Service Type", "Service"]) || ""
        ).trim(),
        frequency: String(
          getCell(row, headerMap, ["Frequency"]) || ""
        ).trim(),
        cleaningDays: String(
          getCell(row, headerMap, ["Cleaning Days", "Days"]) || ""
        ).trim(),
        scopeOfWork: String(
          getCell(row, headerMap, ["Scope Of Work", "Scope", "SOW"]) || ""
        ).trim(),
        notes: String(
          getCell(row, headerMap, ["Notes", "Account Notes"]) || ""
        ).trim(),
      };
    })
    .filter(function (account) {
      return isRealAccountRow(account);
    });

  return dedupeAccountsForApp(rawAccounts);
}

function getMapAccountsFast() {
  return getAllAccounts()
    .filter(function (account) {
      const latitude = account.latitude || account.Latitude;
      const longitude = account.longitude || account.Longitude;

      return latitude !== "" && longitude !== "";
    })
    .map(function (account) {
      return {
        id: account.id || account.accountId || "",
        accountId: account.accountId || account.id || "",
        accountName: account.accountName || "",
        address: account.address || "",
        city: account.city || "",
        state: account.state || "",
        zip: account.zip || "",
        latitude: account.latitude || account.Latitude || "",
        longitude: account.longitude || account.Longitude || "",
        Latitude: account.Latitude || account.latitude || "",
        Longitude: account.Longitude || account.longitude || "",
        status: account.status || "",
        manager: account.manager || "",
        subcontractor: account.subcontractor || "",
        accountHealth: account.accountHealth || "",
      };
    });
}

function getAllAccounts() {
  const sheet = getAccountsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const rows = values.slice(1);

  const rawAccounts = rows
    .map(function (row, index) {
      const accountName = String(
        getCell(row, headerMap, [
          "Account Name",
          "Account",
          "Name",
          "Customer",
        ]) || ""
      ).trim();

      const address = String(
        getCell(row, headerMap, [
          "Address",
          "Full Address",
          "Service Address",
        ]) || ""
      ).trim();

      const city = String(getCell(row, headerMap, ["City"]) || "").trim();
      const state = String(getCell(row, headerMap, ["State"]) || "").trim();
      const zip = String(
        getCell(row, headerMap, ["Zip", "Zip Code"]) || ""
      ).trim();

      const status = String(
        getCell(row, headerMap, ["Status", "Account Status"]) || ""
      ).trim();

      const cancelledDate = String(
        getCell(row, headerMap, [
          "Cancelled Date",
          "Canceled Date",
          "Cancellation Date",
          "Cancel Date",
        ]) || ""
      ).trim();

      const monthlyRevenue = String(
        getCell(row, headerMap, [
          "Monthly Revenue",
          "What Cleaning World Gets Paid",
          "Cleaning World Gets Paid",
          "Monthly Billing",
        ]) || ""
      ).trim();

      const subcontractorPay = String(
        getCell(row, headerMap, [
          "Monthly Subcontractor Pay",
          "Monthly Sub Pay",
          "Subcontractor Pay",
          "Sub Pay",
          "Cleaner Pay",
        ]) || ""
      ).trim();

      return {
        rowNumber: index + 2,
        id: String(
          getCell(row, headerMap, ["ID", "Account ID", "Id"]) || ""
        ).trim(),
        accountId: String(
          getCell(row, headerMap, ["ID", "Account ID", "Id"]) || ""
        ).trim(),
        accountName: accountName,
        address: address,
        city: city,
        state: state,
        zip: zip,
                latitude: String(
          getCell(row, headerMap, ["Latitude", "Lat"]) || ""
        ).trim(),
        longitude: String(
          getCell(row, headerMap, ["Longitude", "Lng", "Long"]) || ""
        ).trim(),
        Latitude: String(
          getCell(row, headerMap, ["Latitude", "Lat"]) || ""
        ).trim(),
        Longitude: String(
          getCell(row, headerMap, ["Longitude", "Lng", "Long"]) || ""
        ).trim(),
        manager: String(
          getCell(row, headerMap, ["Manager", "Account Manager"]) || ""
        ).trim(),
        subcontractor: String(
          getCell(row, headerMap, [
            "Subcontractor",
            "Sub Contractor",
            "Cleaner",
            "Sub",
            "Sub Name",
          ]) || ""
        ).trim(),
        status: status,
        cancelledDate: cancelledDate,
        accountHealth: String(
          getCell(row, headerMap, ["Account Health", "Health", "Score"]) || ""
        ).trim(),
        accountStartDate: formatDateForApp(
          getCell(row, headerMap, [
            "Account Start Date",
            "Start Date",
            "StartDate",
          ])
        ),
        monthlyRevenue: monthlyRevenue,
        monthlySubcontractorPay: subcontractorPay,
        subcontractorPay: subcontractorPay,
        grossMargin: String(
          getCell(row, headerMap, ["Gross Margin", "Margin"]) || ""
        ).trim(),
        grossMarginPercent: String(
          getCell(row, headerMap, [
            "Gross Margin %",
            "Margin %",
            "Gross Margin Percent",
          ]) || ""
        ).trim(),
        hasKey: String(
          getCell(row, headerMap, ["Has Key", "Key", "Keys"]) || ""
        ).trim(),
        alarmCode: String(
          getCell(row, headerMap, ["Alarm Code", "Alarm", "Code"]) || ""
        ).trim(),
        keyAlarmAccessInfo: String(
          getCell(row, headerMap, [
            "Key Alarm Access Info",
            "Key/Alarm Access Info",
            "Access Info",
          ]) || ""
        ).trim(),
        contactName: String(
          getCell(row, headerMap, ["Contact Name", "Contact"]) || ""
        ).trim(),
        phone: String(
          getCell(row, headerMap, ["Phone", "Phone Number"]) || ""
        ).trim(),
        email: String(
          getCell(row, headerMap, ["Email", "Email Address"]) || ""
        ).trim(),
        serviceType: String(
          getCell(row, headerMap, ["Service Type", "Service"]) || ""
        ).trim(),
        frequency: String(
          getCell(row, headerMap, ["Frequency"]) || ""
        ).trim(),
        cleaningDays: String(
          getCell(row, headerMap, ["Cleaning Days", "Days"]) || ""
        ).trim(),
        scopeOfWork: String(
          getCell(row, headerMap, ["Scope Of Work", "Scope", "SOW"]) || ""
        ).trim(),
        notes: String(
          getCell(row, headerMap, ["Notes", "Account Notes"]) || ""
        ).trim(),
      };
    })
    .filter(function (account) {
      const name = String(account.accountName || "").trim();
      if (!name) return false;
      return true;
    });

  return dedupeAccountsForApp(rawAccounts);
}
function addAccount(body) {
  const sheet = getAccountsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("Accounts sheet has no headers.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const newRow = new Array(headers.length).fill("");
  const newId = generateId("ACCT");

  const now = new Date();
  const timestamp = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "M/d/yyyy H:mm:ss"
  );

  const monthlyRevenue = pickFirstValue([
    body.monthlyRevenue,
    body.revenue,
    body.monthlyBilling,
  ]);

  const monthlySubcontractorPay = pickFirstValue([
    body.monthlySubcontractorPay,
    body.subcontractorPay,
    body.monthlySubPay,
    body.cleanerPay,
  ]);

  setCell(newRow, headerMap, ["ID", "Account ID", "Id"], newId);
  setCell(
    newRow,
    headerMap,
    ["Account Name", "Account", "Name", "Customer"],
    body.accountName || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Address", "Full Address", "Service Address"],
    body.address || ""
  );
  setCell(newRow, headerMap, ["City"], body.city || "");
  setCell(newRow, headerMap, ["State"], body.state || "");
  setCell(newRow, headerMap, ["Zip", "Zip Code"], body.zip || "");
  setCell(
    newRow,
    headerMap,
    ["Manager", "Account Manager"],
    body.manager || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Subcontractor", "Sub Contractor", "Cleaner", "Sub", "Sub Name"],
    body.subcontractor || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Status", "Account Status"],
    body.status || "Active"
  );
  setCell(
    newRow,
    headerMap,
    ["Account Health", "Health", "Score"],
    body.accountHealth || "Stable"
  );
  setCell(
    newRow,
    headerMap,
    ["Account Start Date", "Start Date", "StartDate"],
    body.accountStartDate || body.startDate || ""
  );

  setCell(
    newRow,
    headerMap,
    [
      "Monthly Revenue",
      "What Cleaning World Gets Paid",
      "Cleaning World Gets Paid",
      "Monthly Billing",
    ],
    monthlyRevenue
  );

  setCell(
    newRow,
    headerMap,
    [
      "Monthly Subcontractor Pay",
      "Monthly Sub Pay",
      "Subcontractor Pay",
      "Sub Pay",
      "Cleaner Pay",
    ],
    monthlySubcontractorPay
  );

  setCell(newRow, headerMap, ["Gross Margin", "Margin"], body.grossMargin || "");
  setCell(
    newRow,
    headerMap,
    ["Gross Margin %", "Margin %", "Gross Margin Percent"],
    body.grossMarginPercent || ""
  );

  setCell(newRow, headerMap, ["Has Key", "Key", "Keys"], body.hasKey || "");
  setCell(
    newRow,
    headerMap,
    ["Alarm Code", "Alarm", "Code"],
    body.alarmCode || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Key Alarm Access Info", "Key/Alarm Access Info", "Access Info"],
    body.keyAlarmAccessInfo || ""
  );

  setCell(newRow, headerMap, ["Contact Name", "Contact"], body.contactName || "");
  setCell(newRow, headerMap, ["Phone", "Phone Number"], body.phone || "");
  setCell(newRow, headerMap, ["Email", "Email Address"], body.email || "");

  setCell(newRow, headerMap, ["Service Type", "Service"], body.serviceType || "");
  setCell(newRow, headerMap, ["Frequency"], body.frequency || "");
  setCell(newRow, headerMap, ["Cleaning Days", "Days"], body.cleaningDays || "");
  setCell(
    newRow,
    headerMap,
    ["Scope Of Work", "Scope", "SOW"],
    body.scopeOfWork || ""
  );
  setCell(newRow, headerMap, ["Notes", "Account Notes"], body.notes || "");

  setCell(newRow, headerMap, ["Created At", "CreatedAt"], timestamp);
  setCell(
    newRow,
    headerMap,
    ["Updated At", "UpdatedAt", "Last Updated / Time Stamp"],
    timestamp
  );

  const accountNameCol = findColumn(headerMap, [
    "Account Name",
    "Account",
    "Name",
    "Customer",
  ]);

  let targetRow = sheet.getLastRow() + 1;

  if (accountNameCol !== -1) {
    const lastRow = Math.max(sheet.getLastRow() - 1, 1);
    const accountNameValues = sheet
      .getRange(2, accountNameCol + 1, lastRow, 1)
      .getValues();

    let lastRealAccountRow = 1;

    for (let i = 0; i < accountNameValues.length; i++) {
      if (String(accountNameValues[i][0] || "").trim() !== "") {
        lastRealAccountRow = i + 2;
      }
    }

    targetRow = lastRealAccountRow + 1;
  }

  sheet.getRange(targetRow, 1, 1, headers.length).setValues([newRow]);

  sendNewAccountAddedEmail(body, newId, monthlyRevenue, monthlySubcontractorPay);

  return {
    success: true,
    id: newId,
    accountId: newId,
    message: "Account added successfully.",
  };
}

function updateAccount(body) {
  const sheet = getAccountsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("No accounts found.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);

  const idCol = findColumn(headerMap, ["ID", "Account ID", "Id"]);
  const nameCol = findColumn(headerMap, [
    "Account Name",
    "Account",
    "Name",
    "Customer",
  ]);

  const targetId = String(body.accountId || body.id || "").trim();
  const targetRowNumber = Number(body.rowNumber || 0);
  const targetName = String(body.accountName || "").trim();

  let rowIndex = -1;

// 1. Match by ID first — this is the reliable source of truth
if (rowIndex === -1 && idCol !== -1 && targetId) { const matchingRows = []; for (let i = 1; i < values.length; i++) { const rowId = String(values[i][idCol] || "").trim(); if (rowId === targetId) { matchingRows.push(i + 1); } } if (matchingRows.length > 1) { throw new Error("This account has a duplicate ID conflict and can't be saved safely — contact admin. Account ID: " + targetId + " matches rows " + matchingRows.join(", ") + "."); } if (matchingRows.length === 1) { rowIndex = matchingRows[0]; } }

// 2. Match by account name — only if no ID match was found
if (rowIndex === -1 && nameCol !== -1 && targetName) {
  for (let i = 1; i < values.length; i++) {
    const rowName = String(values[i][nameCol] || "").trim();

    if (rowName === targetName) {
      rowIndex = i + 1;
      break;
    }
  }
}

// 3. Only fall back to rowNumber if ID and name both failed to match,
//    AND verify that row actually corresponds to this account before trusting it
if (
  rowIndex === -1 &&
  !isNaN(targetRowNumber) &&
  targetRowNumber >= 2 &&
  targetRowNumber <= sheet.getLastRow()
) {
  const candidateRow = values[targetRowNumber - 1];

  const candidateId =
    idCol !== -1 ? String(candidateRow[idCol] || "").trim() : "";

  const candidateName =
    nameCol !== -1 ? String(candidateRow[nameCol] || "").trim() : "";

  const idMatches = targetId && candidateId && candidateId === targetId;
  const nameMatches =
    targetName && candidateName && candidateName === targetName;

  if (idMatches || nameMatches) {
    rowIndex = targetRowNumber;
  }
}

  if (rowIndex === -1) {
    throw new Error("Could not find account to update.");
  }

  const row = values[rowIndex - 1];

  const now = new Date();
  const timestamp = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "M/d/yyyy H:mm:ss"
  );

  const finalId =
    targetId ||
    String(getCell(row, headerMap, ["ID", "Account ID", "Id"]) || "").trim() ||
    generateId("ACCT");

  const monthlyRevenue = pickFirstValue([
    body.monthlyRevenue,
    body.revenue,
    body.monthlyBilling,
  ]);

  const monthlySubcontractorPay = pickFirstValue([
    body.monthlySubcontractorPay,
    body.subcontractorPay,
    body.monthlySubPay,
    body.cleanerPay,
  ]);

  setCell(row, headerMap, ["ID", "Account ID", "Id"], finalId);
  setCell(
    row,
    headerMap,
    ["Account Name", "Account", "Name", "Customer"],
    body.accountName || ""
  );
  setCell(
    row,
    headerMap,
    ["Address", "Full Address", "Service Address"],
    body.address || ""
  );
  setCell(row, headerMap, ["City"], body.city || "");
  setCell(row, headerMap, ["State"], body.state || "");
  setCell(row, headerMap, ["Zip", "Zip Code"], body.zip || "");
  setCell(row, headerMap, ["Manager", "Account Manager"], body.manager || "");
  setCell(
    row,
    headerMap,
    ["Subcontractor", "Sub Contractor", "Cleaner", "Sub", "Sub Name"],
    body.subcontractor || ""
  );
  setCell(row, headerMap, ["Status", "Account Status"], body.status || "");
  setCell(
    row,
    headerMap,
    ["Cancelled Date", "Canceled Date", "Cancellation Date", "Cancel Date"],
    body.cancelledDate || ""
  );
  setCell(
    row,
    headerMap,
    ["Account Health", "Health", "Score"],
    body.accountHealth || ""
  );
  setCell(
    row,
    headerMap,
    ["Account Start Date", "Start Date", "StartDate"],
    body.accountStartDate || body.startDate || ""
  );

  setCell(
    row,
    headerMap,
    [
      "Monthly Revenue",
      "What Cleaning World Gets Paid",
      "Cleaning World Gets Paid",
      "Monthly Billing",
    ],
    monthlyRevenue
  );

  setCell(
    row,
    headerMap,
    [
      "Monthly Subcontractor Pay",
      "Monthly Sub Pay",
      "Subcontractor Pay",
      "Sub Pay",
      "Cleaner Pay",
    ],
    monthlySubcontractorPay
  );

  setCell(row, headerMap, ["Gross Margin", "Margin"], body.grossMargin || "");
  setCell(
    row,
    headerMap,
    ["Gross Margin %", "Margin %", "Gross Margin Percent"],
    body.grossMarginPercent || ""
  );

  setCell(row, headerMap, ["Has Key", "Key", "Keys"], body.hasKey || "");
  setCell(row, headerMap, ["Alarm Code", "Alarm", "Code"], body.alarmCode || "");
  setCell(
    row,
    headerMap,
    ["Key Alarm Access Info", "Key/Alarm Access Info", "Access Info"],
    body.keyAlarmAccessInfo || ""
  );

  setCell(row, headerMap, ["Contact Name", "Contact"], body.contactName || "");
  setCell(row, headerMap, ["Phone", "Phone Number"], body.phone || "");
  setCell(row, headerMap, ["Email", "Email Address"], body.email || "");

  setCell(row, headerMap, ["Service Type", "Service"], body.serviceType || "");
  setCell(row, headerMap, ["Frequency"], body.frequency || "");
  setCell(row, headerMap, ["Cleaning Days", "Days"], body.cleaningDays || "");
  setCell(row, headerMap, ["Scope Of Work", "Scope", "SOW"], body.scopeOfWork || "");
  setCell(row, headerMap, ["Notes", "Account Notes"], body.notes || "");
  setCell(
    row,
    headerMap,
    ["Updated At", "UpdatedAt", "Last Updated / Time Stamp"],
    timestamp
  );

  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);

  return {
    success: true,
    id: finalId,
    accountId: finalId,
    rowNumber: rowIndex,
    message: "Account updated successfully.",
  };
}

function isRealAccountRow(account) {
  const name = String(account.accountName || "").trim();

  if (!name) return false;

  return true;
}

function getAccountDedupeKey(account) {
  const nameKey = normalizeAccountKeyForAppsScript(account.accountName);
  const addressKey = normalizeAddressKeyForAppsScript(account.address);
  const cityKey = normalizeAccountKeyForAppsScript(account.city);
  const zipKey = normalizeAccountKeyForAppsScript(account.zip);

  if (nameKey && addressKey) {
    return "name-address:" + nameKey + "-" + addressKey;
  }

  if (nameKey && cityKey) {
    return "name-city:" + nameKey + "-" + cityKey;
  }

  if (nameKey && zipKey) {
    return "name-zip:" + nameKey + "-" + zipKey;
  }

  if (nameKey) {
    return "name:" + nameKey;
  }

  return "row:" + String(account.rowNumber || "");
}

function getAccountQualityScore(account) {
  let score = 0;

  if (account.id) score += 2;
  if (account.accountName) score += 5;
  if (account.address) score += 3;
  if (account.city) score += 1;
  if (account.state) score += 1;
  if (account.zip) score += 1;
  if (account.manager) score += 1;
  if (account.subcontractor) score += 1;
  if (account.status) score += 2;
  if (account.accountHealth) score += 1;
  if (parseMoneyForAppsScript(account.monthlyRevenue) > 0) score += 5;
  if (parseMoneyForAppsScript(account.subcontractorPay) > 0) score += 5;
  if (account.notes) score += 1;

  return score;
}

function shouldReplaceAccount(existing, incoming) {
  const existingRevenue = parseMoneyForAppsScript(existing.monthlyRevenue);
  const incomingRevenue = parseMoneyForAppsScript(incoming.monthlyRevenue);

  const existingSubPay = parseMoneyForAppsScript(existing.subcontractorPay);
  const incomingSubPay = parseMoneyForAppsScript(incoming.subcontractorPay);

  const existingStatusBad = isBadAccountStatusForAppsScript(existing.status);
  const incomingStatusBad = isBadAccountStatusForAppsScript(incoming.status);

  if (existingStatusBad && !incomingStatusBad) return true;
  if (!existingStatusBad && incomingStatusBad) return false;

  if (existingRevenue <= 0 && incomingRevenue > 0) return true;
  if (existingSubPay <= 0 && incomingSubPay > 0) return true;

  const existingQuality = getAccountQualityScore(existing);
  const incomingQuality = getAccountQualityScore(incoming);

  if (incomingQuality > existingQuality) return true;

  return false;
}

function dedupeAccountsForApp(accounts) {
  const map = {};

  accounts.forEach(function (account) {
    const key = getAccountDedupeKey(account);

    if (!map[key]) {
      map[key] = account;
      return;
    }

    if (shouldReplaceAccount(map[key], account)) {
      map[key] = account;
    }
  });

  return Object.keys(map).map(function (key) {
    return map[key];
  });
}
/* =========================================================
   VISITS
========================================================= */

function getVisits() {
  const sheet = getVisitsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const rows = values.slice(1);

  return rows
    .filter(function (row) {
      const accountName = String(
        getCell(row, headerMap, ["Account Name", "Account"]) || ""
      ).trim();

      const visitDate = String(
        getCell(row, headerMap, ["Visit Date", "Date"]) || ""
      ).trim();

      const notes = String(
        getCell(row, headerMap, ["Notes", "Visit Notes"]) || ""
      ).trim();

      return accountName !== "" || visitDate !== "" || notes !== "";
    })
    .map(function (row) {
      return {
        id: String(getCell(row, headerMap, ["Visit ID", "ID"]) || ""),
        accountId: String(
          getCell(row, headerMap, ["Account ID", "AccountId"]) || ""
        ),
        accountName: String(
          getCell(row, headerMap, ["Account Name", "Account"]) || ""
        ),
        date: formatDateForApp(getCell(row, headerMap, ["Visit Date", "Date"])),
        visitType: String(getCell(row, headerMap, ["Visit Type", "Type"]) || ""),
        manager: String(
          getCell(row, headerMap, ["Completed By", "Manager", "Visited By"]) ||
            ""
        ),
        completedBy: String(
          getCell(row, headerMap, ["Completed By", "Manager", "Visited By"]) ||
            ""
        ),
        subcontractor: String(
          getCell(row, headerMap, [
            "Subcontractor",
            "Sub Contractor",
            "Cleaner",
            "Sub",
            "Sub Name",
          ]) || ""
        ),
        condition: String(
          getCell(row, headerMap, [
            "Condition Score",
            "Condition",
            "Score",
            "Visit Score",
          ]) || ""
        ),
        score: String(
          getCell(row, headerMap, [
            "Condition Score",
            "Condition",
            "Score",
            "Visit Score",
          ]) || ""
        ),
        followUpNeeded: String(
          getCell(row, headerMap, [
            "Follow-Up Needed",
            "Follow Up Needed",
            "Follow-up Needed",
          ]) || ""
        ),
        followUpDate: formatDateForApp(
          getCell(row, headerMap, [
            "Follow-up Date",
            "Follow Up Date",
            "Follow-Up Date",
          ])
        ),
        notes: String(getCell(row, headerMap, ["Notes", "Visit Notes"]) || ""),
        createdAt: formatDateForApp(
          getCell(row, headerMap, ["Created At", "CreatedAt"])
        ),
        updatedAt: formatDateForApp(
          getCell(row, headerMap, ["Updated At", "UpdatedAt"])
        ),
      };
    });
}

function addVisit(body) {
  const sheet = getVisitsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("Visits sheet has no headers.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const newRow = new Array(headers.length).fill("");
  const newId = generateId("VISIT");

  const now = new Date();
  const timestamp = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "M/d/yyyy H:mm:ss"
  );

  setCell(newRow, headerMap, ["Visit ID", "ID"], newId);
  setCell(newRow, headerMap, ["Account ID", "AccountId"], body.accountId || "");
  setCell(newRow, headerMap, ["Account Name", "Account"], body.accountName || "");
  setCell(newRow, headerMap, ["Visit Date", "Date"], body.date || "");
  setCell(newRow, headerMap, ["Visit Type", "Type"], body.visitType || "");
  setCell(
    newRow,
    headerMap,
    ["Completed By", "Manager", "Visited By"],
    body.manager || body.completedBy || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Subcontractor", "Sub Contractor", "Cleaner", "Sub", "Sub Name"],
    body.subcontractor || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Condition Score", "Condition", "Score", "Visit Score"],
    body.condition || body.score || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Follow-Up Needed", "Follow Up Needed", "Follow-up Needed"],
    body.followUpNeeded || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Follow-up Date", "Follow Up Date", "Follow-Up Date"],
    body.followUpDate || ""
  );
  setCell(newRow, headerMap, ["Notes", "Visit Notes"], body.notes || "");
  setCell(newRow, headerMap, ["Created At", "CreatedAt"], timestamp);
  setCell(newRow, headerMap, ["Updated At", "UpdatedAt"], timestamp);

  sheet.appendRow(newRow);

  return {
    success: true,
    id: newId,
    message: "Visit added successfully.",
  };
}

/* =========================================================
   COMPLAINTS
========================================================= */

function getComplaints() {
  const sheet = getComplaintsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const rows = values.slice(1);

  return rows
    .filter(function (row) {
      const date = String(
        getCell(row, headerMap, ["Date", "Complaint Date"]) || ""
      ).trim();

      const accountName = String(
        getCell(row, headerMap, ["Account Name", "Account"]) || ""
      ).trim();

      const issue = String(
        getCell(row, headerMap, [
          "Description",
          "Complaint",
          "Issue",
          "Complaint Type",
          "Type",
        ]) || ""
      ).trim();

      return date !== "" || accountName !== "" || issue !== "";
    })
    .map(function (row, index) {
      return {
        rowNumber: index + 2,
        id: String(getCell(row, headerMap, ["ID", "Complaint ID"]) || ""),
        date: formatDateForApp(
          getCell(row, headerMap, ["Date", "Complaint Date"])
        ),
        accountId: String(
          getCell(row, headerMap, ["Account ID", "AccountId"]) || ""
        ),
        accountName: String(
          getCell(row, headerMap, ["Account Name", "Account"]) || ""
        ),
        complaintType: String(
          getCell(row, headerMap, ["Complaint Type", "Type"]) || ""
        ),
        priority: String(
          getCell(row, headerMap, ["Priority", "Severity"]) || ""
        ),
        severity: String(
          getCell(row, headerMap, ["Severity", "Priority"]) || ""
        ),
        status: String(getCell(row, headerMap, ["Status"]) || "Open"),
        complaintValidity: String(
          getCell(row, headerMap, [
            "Complaint Validity",
            "Validity",
            "Valid Complaint",
          ]) || ""
        ),
        manager: String(
          getCell(row, headerMap, ["Manager", "Assigned To"]) || ""
        ),
        subcontractor: String(
          getCell(row, headerMap, [
            "Subcontractor",
            "Sub Contractor",
            "Cleaner",
            "Sub",
            "Sub Name",
          ]) || ""
        ),
        description: String(
          getCell(row, headerMap, ["Description", "Complaint", "Issue"]) || ""
        ),
        resolution: String(
          getCell(row, headerMap, ["Resolution", "Resolution Notes"]) || ""
        ),
        followUpDate: formatDateForApp(
          getCell(row, headerMap, [
            "Follow Up Date",
            "Follow-up Date",
            "Follow-Up Date",
          ])
        ),
        notes: String(
          getCell(row, headerMap, ["Notes", "Complaint Notes"]) || ""
        ),
        reportedBy: String(
          getCell(row, headerMap, ["Reported By", "Reporter"]) || ""
        ),
      };
    });
}

function addComplaint(body) {
  const sheet = getComplaintsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("Complaints sheet has no headers.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const newRow = new Array(headers.length).fill("");
  const newId = generateId("COMP");

  setCell(newRow, headerMap, ["ID", "Complaint ID"], newId);
  setCell(newRow, headerMap, ["Date", "Complaint Date"], body.date || "");
  setCell(newRow, headerMap, ["Account ID", "AccountId"], body.accountId || "");
  setCell(newRow, headerMap, ["Account Name", "Account"], body.accountName || "");
  setCell(
    newRow,
    headerMap,
    ["Complaint Type", "Type"],
    body.complaintType || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Priority", "Severity"],
    body.priority || body.severity || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Severity", "Priority"],
    body.severity || body.priority || ""
  );
  setCell(newRow, headerMap, ["Status"], body.status || "Open");
  setCell(
    newRow,
    headerMap,
    ["Complaint Validity", "Validity", "Valid Complaint"],
    body.complaintValidity || body.validity || "Needs Review"
  );
  setCell(newRow, headerMap, ["Manager", "Assigned To"], body.manager || "");
  setCell(
    newRow,
    headerMap,
    ["Subcontractor", "Sub Contractor", "Cleaner", "Sub", "Sub Name"],
    body.subcontractor || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Description", "Complaint", "Issue"],
    body.description || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Resolution", "Resolution Notes"],
    body.resolution || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Follow Up Date", "Follow-up Date", "Follow-Up Date"],
    body.followUpDate || ""
  );
  setCell(
    newRow,
    headerMap,
    ["Notes", "Complaint Notes"],
    body.notes || body.Notes || ""
  );

  const complaintNameCol = findColumn(headerMap, ["Account Name", "Account"]);

  let targetRow = sheet.getLastRow() + 1;

  if (complaintNameCol !== -1) {
    const lastRow = Math.max(sheet.getLastRow() - 1, 1);
    const complaintNameValues = sheet
      .getRange(2, complaintNameCol + 1, lastRow, 1)
      .getValues();

    let lastRealComplaintRow = 1;

    for (let i = 0; i < complaintNameValues.length; i++) {
      if (String(complaintNameValues[i][0] || "").trim() !== "") {
        lastRealComplaintRow = i + 2;
      }
    }

    targetRow = lastRealComplaintRow + 1;
  }

  sheet.getRange(targetRow, 1, 1, headers.length).setValues([newRow]);

  sendInternalNotificationEmail(
    "New Complaint Created - " + String(body.accountName || "Cleaning World"),
    "New Complaint Created",
    [
      { label: "Account", value: body.accountName || "" },
      { label: "Complaint Date", value: body.date || "" },
      { label: "Issue", value: body.description || body.complaintType || "" },
      { label: "Priority", value: body.priority || body.severity || "" },
      { label: "Status", value: body.status || "Open" },
      {
        label: "Validity",
        value: body.complaintValidity || body.validity || "Needs Review",
      },
      { label: "Assigned To", value: body.manager || "" },
      { label: "Subcontractor", value: body.subcontractor || "" },
      { label: "Follow-Up Date", value: body.followUpDate || "" },
      { label: "Notes", value: body.notes || body.Notes || "" },
      { label: "Resolution", value: body.resolution || "" },
    ]
  );

  sendComplaintNotificationToSubcontractor(body);

  return {
    success: true,
    id: newId,
    message: "Complaint saved successfully.",
  };
}

function updateComplaint(body) {
  const complaintData = body.complaint || body;

  const sheet = getComplaintsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("No complaints found.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);

  const idCol = findColumn(headerMap, ["ID", "Complaint ID"]);
  const dateCol = findColumn(headerMap, ["Date", "Complaint Date"]);
  const accountNameCol = findColumn(headerMap, ["Account Name", "Account"]);
  const issueCol = findColumn(headerMap, [
    "Description",
    "Complaint",
    "Issue",
    "Complaint Type",
    "Type",
  ]);

  const targetId = String(
    complaintData.id || complaintData.complaintId || ""
  ).trim();

  const targetRowNumber = Number(complaintData.rowNumber || 0);

  const targetAccountName = String(
    complaintData.accountName || complaintData["Account Name"] || ""
  ).trim();

  const targetDate = String(
    complaintData.date ||
      complaintData.complaintDate ||
      complaintData["Complaint Date"] ||
      ""
  ).trim();

  const targetIssue = String(
    complaintData.description || complaintData.issue || complaintData.Issue || ""
  ).trim();

  let rowIndex = -1;

  if (
    !isNaN(targetRowNumber) &&
    targetRowNumber >= 2 &&
    targetRowNumber <= sheet.getLastRow()
  ) {
    rowIndex = targetRowNumber;
  }

  if (rowIndex === -1 && idCol !== -1 && targetId) {
    for (let i = 1; i < values.length; i++) {
      const rowId = String(values[i][idCol] || "").trim();

      if (rowId === targetId) {
        rowIndex = i + 1;
        break;
      }
    }
  }

  if (rowIndex === -1 && targetAccountName && targetIssue) {
    for (let i = 1; i < values.length; i++) {
      const rowAccountName =
        accountNameCol !== -1
          ? String(values[i][accountNameCol] || "").trim()
          : "";

      const rowDate =
        dateCol !== -1 ? String(values[i][dateCol] || "").trim() : "";

      const rowIssue =
        issueCol !== -1 ? String(values[i][issueCol] || "").trim() : "";

      const accountMatches = rowAccountName === targetAccountName;
      const issueMatches = rowIssue === targetIssue;
      const dateMatches = !targetDate || rowDate === targetDate;

      if (accountMatches && issueMatches && dateMatches) {
        rowIndex = i + 1;
        break;
      }
    }
  }

  if (rowIndex === -1) {
    throw new Error("Could not find complaint to update.");
  }

  const row = values[rowIndex - 1];

  const newStatus = complaintData.status || "Closed";

  const resolution =
    complaintData.resolution ||
    complaintData.resolutionNotes ||
    complaintData.notes ||
    "";

  const followUpDate =
    complaintData.followUpDate ||
    complaintData.closedDate ||
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");

  setCell(row, headerMap, ["Status"], newStatus);
  setCell(row, headerMap, ["Resolution", "Resolution Notes"], resolution);
  setCell(
    row,
    headerMap,
    ["Follow Up Date", "Follow-up Date", "Follow-Up Date"],
    followUpDate
  );
  setCell(
    row,
    headerMap,
    ["Updated At", "UpdatedAt"],
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "M/d/yyyy H:mm:ss"
    )
  );

  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);

  return {
    success: true,
    id: targetId,
    rowNumber: rowIndex,
    status: newStatus,
    message: "Complaint updated successfully.",
  };
}

function sendComplaintNotificationToSubcontractor(body) {
  try {
    const accountName = String(body.accountName || "").trim();
    const subcontractorName = String(body.subcontractor || "").trim();

    if (!accountName || !subcontractorName) {
      return false;
    }

    let subcontractorEmail = String(body.subcontractorEmail || "").trim();

    if (!subcontractorEmail) {
      subcontractorEmail = findSubcontractorEmailByName(subcontractorName);
    }

    if (!subcontractorEmail) {
      console.log(
        "Complaint notification skipped. No subcontractor email found for " +
          subcontractorName
      );
      return false;
    }

    const complaintDate = String(body.date || "").trim();
    const complaintType = String(body.complaintType || "").trim();
    const priority = String(body.priority || body.severity || "").trim();
    const description = String(body.description || body.issue || "").trim();
    const followUpDate = String(body.followUpDate || "").trim();
    const manager = String(body.manager || "Cleaning World Office").trim();
    const validity = String(
      body.complaintValidity || body.validity || "Needs Review"
    ).trim();

    const subject = "New Complaint - " + accountName;

    const htmlBody = `
      <div style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;padding:24px;">
          <div style="background:linear-gradient(135deg,#003b7a 0%,#005bbb 55%,#00a8e8 100%);border-radius:22px;padding:22px;color:white;">
            <div style="display:flex;align-items:center;gap:16px;">
              <div style="background:white;border-radius:16px;padding:10px;width:130px;height:70px;display:flex;align-items:center;justify-content:center;">
                <img src="${CLEANING_WORLD_LOGO_URL}" alt="Cleaning World" style="max-width:100%;max-height:100%;object-fit:contain;" />
              </div>
              <div>
                <div style="font-size:24px;font-weight:900;line-height:1;">Cleaning World</div>
                <div style="font-size:13px;font-weight:700;margin-top:6px;color:rgba(255,255,255,0.9);">
                  Complaint Notification
                </div>
              </div>
            </div>
          </div>

          <div style="background:white;border-radius:22px;margin-top:18px;padding:22px;border:1px solid #dbeafe;">
            <h2 style="margin:0 0 8px;font-size:22px;color:#003b7a;">
              New Complaint Received
            </h2>

            <p style="margin:0 0 18px;font-size:14px;color:#475569;line-height:1.5;">
              Please review the complaint details below and follow up with Cleaning World if anything needs clarification.
            </p>

            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#334155;width:210px;">Account Name</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;">${escapeHtml(accountName)}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#334155;">Complaint Date</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;">${escapeHtml(complaintDate || "-")}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#334155;">Complaint Type</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;">${escapeHtml(complaintType || "-")}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#334155;">Priority</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;">${escapeHtml(priority || "-")}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#334155;">Validity</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;">${escapeHtml(validity || "-")}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#334155;">Description</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;white-space:pre-wrap;">${escapeHtml(description || "-")}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#334155;">Follow-Up Date</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;">${escapeHtml(followUpDate || "-")}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#334155;">Cleaning World Contact</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;">${escapeHtml(manager || "Cleaning World Office")}</td>
              </tr>
            </table>

            <p style="margin:22px 0 0;font-size:12px;color:#64748b;">
              This is an automatic notification from the Cleaning World Operations & Quality Management System.
            </p>
          </div>
        </div>
      </div>
    `;

    const plainBody =
      "New Complaint Received\n\n" +
      "Account Name: " +
      accountName +
      "\n" +
      "Complaint Date: " +
      (complaintDate || "-") +
      "\n" +
      "Complaint Type: " +
      (complaintType || "-") +
      "\n" +
      "Priority: " +
      (priority || "-") +
      "\n" +
      "Validity: " +
      (validity || "-") +
      "\n" +
      "Description: " +
      (description || "-") +
      "\n" +
      "Follow-Up Date: " +
      (followUpDate || "-") +
      "\n" +
      "Cleaning World Contact: " +
      (manager || "Cleaning World Office");

        MailApp.sendEmail({
      to: subcontractorEmail,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: "Cleaning World App",
    });

    logEmailEvent({
      accountName: body.accountName || "",
      accountId: body.accountId || body.id || "",
      emailType: "Complaint Notification",
      sentTo: subcontractorEmail,
      subject: subject,
      status: "Sent",
      relatedId: body.complaintId || body.id || body.accountName || "",
      triggeredBy: body.triggeredBy || "System",
      userRole: body.userRole || "",
      source: "Apps Script - sendComplaintNotificationToSubcontractor",
      notes: "Complaint notification sent to subcontractor."
    });

    return true;
  } catch (error) {
    logEmailEvent({
      accountName: body.accountName || "",
      accountId: body.accountId || body.id || "",
      emailType: "Complaint Notification",
      sentTo: subcontractorEmail || "",
      subject: subject || "Complaint Notification",
      status: "Failed",
      relatedId: body.complaintId || body.id || body.accountName || "",
      triggeredBy: body.triggeredBy || "System",
      userRole: body.userRole || "",
      source: "Apps Script - sendComplaintNotificationToSubcontractor",
      notes: String(error)
    });
    console.log("Subcontractor complaint email failed: " + String(error));
    return false;
  }
}
/* =========================================================
   ACCOUNT UPDATES
========================================================= */

function getAccountUpdates() {
  const sheet = getAccountUpdatesSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const rows = values.slice(1);

  return rows
    .filter(function (row) {
      return row.join("").trim() !== "";
    })
    .map(function (row) {
      return {
        id: String(getCell(row, headerMap, ["ID", "Update ID"]) || ""),
        date: formatDateForApp(
          getCell(row, headerMap, ["Date", "Update Date"])
        ),
        accountId: String(
          getCell(row, headerMap, ["Account ID", "AccountId"]) || ""
        ),
        accountName: String(
          getCell(row, headerMap, ["Account Name", "Account"]) || ""
        ),
        updateType: String(
          getCell(row, headerMap, ["Update Type", "Type"]) || ""
        ),
        title: String(getCell(row, headerMap, ["Title", "Subject"]) || ""),
        manager: String(
          getCell(row, headerMap, ["Manager", "Created By"]) || ""
        ),
        notes: String(
          getCell(row, headerMap, ["Notes", "Update Notes", "Description"]) ||
            ""
        ),
        notifyEmail: String(
          getCell(row, headerMap, [
            "Notify Email",
            "Email Notification",
            "Email",
          ]) || ""
        ),
        followUpNeeded: String(
          getCell(row, headerMap, [
            "Follow Up Needed",
            "Follow-Up Needed",
          ]) || ""
        ),
        followUpDate: formatDateForApp(
          getCell(row, headerMap, [
            "Follow Up Date",
            "Follow-up Date",
            "Follow-Up Date",
          ])
        ),
      };
    });
}

function addAccountUpdate(body) {
  const sheet = getAccountUpdatesSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("Account Updates sheet has no headers.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const newRow = new Array(headers.length).fill("");
  const newId = generateId("UPD");

  const now = new Date();
  const timestamp = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "M/d/yyyy H:mm:ss"
  );

  const accountName = String(body.accountName || "").trim();
  const accountId = String(body.accountId || body.id || "").trim();
  const updateType = String(body.updateType || body.type || "").trim();
  const title = String(body.title || body.subject || "").trim();
  const manager = String(body.manager || body.createdBy || "").trim();
  const notes = String(body.notes || body.description || body.updateNotes || "").trim();
  const notifyEmail = String(body.notifyEmail || "").trim();
  const followUpNeeded = String(body.followUpNeeded || "").trim();
  const followUpDate = String(body.followUpDate || "").trim();
  const updateDate = String(body.date || body.updateDate || timestamp).trim();

  setCell(newRow, headerMap, ["ID", "Update ID"], newId);
  setCell(newRow, headerMap, ["Date", "Update Date"], updateDate);
  setCell(newRow, headerMap, ["Account ID", "AccountId"], accountId);
  setCell(newRow, headerMap, ["Account Name", "Account"], accountName);
  setCell(newRow, headerMap, ["Update Type", "Type"], updateType);
  setCell(newRow, headerMap, ["Title", "Subject"], title);
  setCell(newRow, headerMap, ["Manager", "Created By"], manager);

  setCell(
    newRow,
    headerMap,
    ["Notes", "Update Notes", "Description"],
    notes
  );

  setCell(
    newRow,
    headerMap,
    ["Notify Email", "Email Notification", "Email"],
    notifyEmail
  );

  setCell(
    newRow,
    headerMap,
    ["Follow Up Needed", "Follow-Up Needed"],
    followUpNeeded
  );

  setCell(
    newRow,
    headerMap,
    ["Follow Up Date", "Follow-up Date", "Follow-Up Date"],
    followUpDate
  );

  sheet.appendRow(newRow);

  const subject =
    "Account Update Added - " + (accountName || "Cleaning World");

  const emailSent = sendInternalNotificationEmail(
    subject,
    "Account Update Added",
    [
      { label: "Account", value: accountName },
      { label: "Account ID", value: accountId },
      { label: "Date / Time", value: updateDate },
      { label: "Update Type", value: updateType },
      { label: "Title", value: title },
      { label: "Manager / Created By", value: manager },
      { label: "Notes", value: notes },
      { label: "Notify Email", value: notifyEmail },
      { label: "Follow-Up Needed", value: followUpNeeded },
      { label: "Follow-Up Date", value: followUpDate },
      { label: "Update ID", value: newId },
    ]
  );

  if (typeof logEmailEvent === "function") {
    logEmailEvent({
      accountName: accountName,
      accountId: accountId,
      emailType: "Account Update Notification",
      sentTo: INTERNAL_NOTIFICATION_EMAIL,
      subject: subject,
      status: emailSent ? "Sent" : "Failed",
      relatedId: newId,
      triggeredBy: manager || body.triggeredBy || "System",
      userRole: body.userRole || "",
      source: "Apps Script - addAccountUpdate",
      notes: emailSent
        ? "Internal account update notification sent."
        : "Account update was saved, but internal notification email failed.",
    });
  }

  return {
    success: true,
    id: newId,
    updateId: newId,
    emailSent: emailSent,
    sentTo: INTERNAL_NOTIFICATION_EMAIL,
    message: emailSent
      ? "Account update saved and email notification sent."
      : "Account update saved, but email notification failed.",
  };
}

/* =========================================================
   SALES
========================================================= */

function getSales() {
  const sheet = getSalesSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const rows = values.slice(1);

  return rows
    .filter(function (row) {
      return row.join("").trim() !== "";
    })
    .map(function (row) {
      return {
        id: String(getCell(row, headerMap, ["ID", "Sale ID"]) || ""),
        accountId: String(
          getCell(row, headerMap, ["Account ID", "AccountId"]) || ""
        ),
        date: formatDateForApp(getCell(row, headerMap, ["Date", "Sale Date"])),
        accountName: String(
          getCell(row, headerMap, ["Account Name", "Account"]) || ""
        ),
        service: String(
          getCell(row, headerMap, ["Service", "Service Sold"]) || ""
        ),
        type: String(getCell(row, headerMap, ["Type", "Sale Type"]) || ""),
        saleType: String(getCell(row, headerMap, ["Type", "Sale Type"]) || ""),
        soldBy: String(
          getCell(row, headerMap, [
            "Sold By",
            "Sales Person",
            "Salesperson",
          ]) || ""
        ),
        manager: String(getCell(row, headerMap, ["Manager"]) || ""),
        amount: String(
          getCell(row, headerMap, ["Amount", "Sale Amount", "Revenue"]) || ""
        ),
        commissionPercent: String(
          getCell(row, headerMap, ["Commission %", "Commission Percent"]) || ""
        ),
        commissionAmount: String(
          getCell(row, headerMap, ["Commission $", "Commission Amount"]) || ""
        ),
        status: String(
          getCell(row, headerMap, ["Status", "Payment Status"]) || ""
        ),
        quarter: String(getCell(row, headerMap, ["Quarter"]) || ""),
        workOrder: String(
          getCell(row, headerMap, [
            "Work Order",
            "Work Order #",
            "Work Order Number",
            "Estimate #",
            "Estimate Number",
            "WO #",
          ]) || ""
        ),
        notes: String(getCell(row, headerMap, ["Notes", "Sale Notes"]) || ""),
      };
    });
}

function getSaleQuarterFromDate(dateValue) {
  if (!dateValue) return "";

  const date = new Date(dateValue);

  if (isNaN(date.getTime())) return "";

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  let quarter = "Q1";

  if (month >= 4 && month <= 6) quarter = "Q2";
  if (month >= 7 && month <= 9) quarter = "Q3";
  if (month >= 10 && month <= 12) quarter = "Q4";

  return quarter + " " + year;
}

function addSale(body) {
  const sheet = getSalesSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("Sales sheet has no headers.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const newRow = new Array(headers.length).fill("");
  const newId = generateId("SALE");

  const saleDate = pickFirstValue([body.date, body.saleDate]);
  const accountId = pickFirstValue([body.accountId, body.accountID]);
  const accountName = pickFirstValue([
    body.accountName,
    body.account,
    body.customer,
  ]);
  const service = pickFirstValue([
    body.service,
    body.serviceSold,
    body.serviceName,
  ]);
  const type = pickFirstValue([body.type, body.saleType]);
  const soldBy = pickFirstValue([
    body.soldBy,
    body.salesPerson,
    body.salesperson,
  ]);
  const manager = pickFirstValue([body.manager, body.accountManager]);
  const amount = pickFirstValue([body.amount, body.saleAmount, body.revenue]);
  const commissionPercent = pickFirstValue([
    body.commissionPercent,
    body.commission,
    body.commissionRate,
  ]);
  const commissionAmount = pickFirstValue([
    body.commissionAmount,
    body.commissionDollar,
    body.commissionDollars,
    body.commissionValue,
  ]);
  const status = pickFirstValue([body.status, body.paymentStatus]);
  const quarter = pickFirstValue([body.quarter, getSaleQuarterFromDate(saleDate)]);
  const workOrder = pickFirstValue([
    body.workOrder,
    body.workOrderNumber,
    body.workOrderNo,
    body.estimateNumber,
    body.estimate,
    body.woNumber,
  ]);
  const notes = pickFirstValue([body.notes, body.saleNotes]);

  const now = new Date();
  const timestamp = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "M/d/yyyy H:mm:ss"
  );

  setCell(newRow, headerMap, ["ID", "Sale ID"], newId);
  setCell(newRow, headerMap, ["Account ID", "AccountId"], accountId);
  setCell(newRow, headerMap, ["Date", "Sale Date"], saleDate);
  setCell(newRow, headerMap, ["Account Name", "Account"], accountName);
  setCell(newRow, headerMap, ["Service", "Service Sold"], service);
  setCell(newRow, headerMap, ["Type", "Sale Type"], type);
  setCell(newRow, headerMap, ["Sold By", "Sales Person", "Salesperson"], soldBy);
  setCell(newRow, headerMap, ["Manager"], manager);
  setCell(newRow, headerMap, ["Amount", "Sale Amount", "Revenue"], amount);
  setCell(
    newRow,
    headerMap,
    ["Commission %", "Commission Percent"],
    commissionPercent
  );
  setCell(
    newRow,
    headerMap,
    ["Commission $", "Commission Amount"],
    commissionAmount
  );
  setCell(newRow, headerMap, ["Status", "Payment Status"], status);
  setCell(newRow, headerMap, ["Quarter"], quarter);
  setCell(
    newRow,
    headerMap,
    [
      "Work Order",
      "Work Order #",
      "Work Order Number",
      "Estimate #",
      "Estimate Number",
      "WO #",
    ],
    workOrder
  );
  setCell(newRow, headerMap, ["Notes", "Sale Notes"], notes);
  setCell(newRow, headerMap, ["Created At", "CreatedAt"], timestamp);
  setCell(newRow, headerMap, ["Updated At", "UpdatedAt"], timestamp);

  sheet.appendRow(newRow);

  return {
    success: true,
    id: newId,
    message: "Sale saved successfully.",
  };
}

function deleteSale(body) {
  const sheet = getSalesSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("No sales found.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const idCol = findColumn(headerMap, ["ID", "Sale ID"]);

  if (idCol === -1) {
    throw new Error("Could not find sale ID column.");
  }

  const targetId = String(body.id || "").trim();

  if (!targetId) {
    throw new Error("Missing sale ID.");
  }

  for (let i = 1; i < values.length; i++) {
    const rowId = String(values[i][idCol] || "").trim();

    if (rowId === targetId) {
      sheet.deleteRow(i + 1);

      return {
        success: true,
        id: targetId,
        message: "Sale deleted successfully.",
      };
    }
  }

  throw new Error("Could not find sale with ID: " + targetId);
}
/* =========================================================
   SUBCONTRACTORS
========================================================= */

function getSubcontractors() {
  const sheet = getSubcontractorsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const rows = values.slice(1);

  const accounts = getAccountsForSubScoring();
  const visits = getVisitsForSubScoring();
  const complaints = getComplaintsForSubScoring();

  return rows
    .filter(function (row) {
      return row.join("").trim() !== "";
    })
    .map(function (row, index) {
      let id =
        getCell(row, headerMap, [
          "ID",
          "Id",
          "Subcontractor ID",
          "Sub ID",
        ]) || "";

      const companyName =
        getCell(row, headerMap, [
          "Company Name",
          "Company",
          "Subcontractor",
          "Subcontractor Name",
          "Sub Name",
          "Name",
        ]) || "";

      const contactName =
        getCell(row, headerMap, [
          "Contact Name",
          "Contact",
          "Owner",
          "Main Contact",
        ]) || "";

      const phone =
        getCell(row, headerMap, [
          "Phone",
          "Phone Number",
          "Cell",
          "Cell Phone",
        ]) || "";

      const email =
        getCell(row, headerMap, [
          "Email",
          "Email Address",
        ]) || "";

      const address =
        getCell(row, headerMap, [
          "Address",
          "Full Address",
        ]) || "";

      const areasServiced =
        getCell(row, headerMap, [
          "Areas Serviced",
          "Area Serviced",
          "Service Area",
          "Areas",
        ]) || "";

      const servicesProvided =
        getCell(row, headerMap, [
          "Services Provided",
          "Service Provided",
          "Services",
        ]) || "";

      const employeeCapacity =
        getCell(row, headerMap, [
          "Employee Capacity",
          "Capacity",
          "Employees",
        ]) || "";

      const insuranceExpiration =
        getCell(row, headerMap, [
          "Insurance Expiration",
          "Insurance Expiration Date",
          "Insurance Exp Date",
          "Insurance",
        ]) || "";

      const status =
        getCell(row, headerMap, [
          "Status",
          "Active Status",
        ]) || "Active";

      const notes =
        getCell(row, headerMap, [
          "Notes",
          "Note",
          "Comments",
        ]) || "";

      if (!id) {
        id = "SUB-ROW-" + String(index + 2);
      }

      const scoring = calculateSubcontractorScore(
        String(companyName),
        accounts,
        visits,
        complaints
      );

     const cleanCompanyName = String(companyName || "").trim();
const cleanContactName = String(contactName || "").trim();

const displayName =
  cleanContactName && cleanCompanyName
    ? cleanContactName + " — " + cleanCompanyName
    : cleanContactName || cleanCompanyName || "Unnamed Subcontractor";

return {
  id: String(id),
  subcontractorId: String(id),

  companyName: cleanCompanyName,
  contactName: cleanContactName,

  name: cleanContactName || cleanCompanyName,
  subcontractor: cleanCompanyName,
  displayName: displayName,
  dropdownLabel: displayName,

  phone: String(phone),
  email: String(email),
  address: String(address),
  areasServiced: String(areasServiced),
  servicesProvided: String(servicesProvided),
  employeeCapacity: String(employeeCapacity),
  insuranceExpiration: formatDateForApp(insuranceExpiration),
  status: String(status),
  notes: String(notes),
  score: String(scoring.score),
  scoreStatus: String(scoring.scoreStatus),
  complaints: String(scoring.complaints),
  avgCondition: String(scoring.avgCondition),
  accountsAssigned: String(scoring.accountsAssigned),
  lastReview: String(scoring.lastReview),
};
    });
}

function getNextSubcontractorId(sheet, headerMap) {
  const idCol = findColumn(headerMap, [
    "ID",
    "Id",
    "Subcontractor ID",
    "Sub ID",
  ]);

  if (idCol === -1) {
    throw new Error("Could not find subcontractor ID column.");
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return "SUB-001";
  }

  const idValues = sheet
    .getRange(2, idCol + 1, lastRow - 1, 1)
    .getValues();

  let highestNumber = 0;

  idValues.forEach(function (row) {
    const value = String(row[0] || "").trim();
    const match = value.match(/^SUB-(\d+)$/);

    if (match) {
      const number = Number(match[1]);
      if (!isNaN(number) && number > highestNumber) {
        highestNumber = number;
      }
    }
  });

  const nextNumber = highestNumber + 1;

  return "SUB-" + String(nextNumber).padStart(3, "0");
}

function addSubcontractor(body) {
  const sheet = getSubcontractorsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("Subcontractors sheet has no headers.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const newRow = new Array(headers.length).fill("");
  const newId = getNextSubcontractorId(sheet, headerMap);

  setCell(
    newRow,
    headerMap,
    ["ID", "Id", "Subcontractor ID", "Sub ID"],
    newId
  );

  setCell(
    newRow,
    headerMap,
    [
      "Company Name",
      "Company",
      "Subcontractor",
      "Subcontractor Name",
      "Sub Name",
      "Name",
    ],
    body.companyName || ""
  );

  setCell(
    newRow,
    headerMap,
    ["Contact Name", "Contact", "Owner", "Main Contact"],
    body.contactName || ""
  );

  setCell(
    newRow,
    headerMap,
    ["Phone", "Phone Number", "Cell", "Cell Phone"],
    body.phone || ""
  );

  setCell(
    newRow,
    headerMap,
    ["Email", "Email Address"],
    body.email || ""
  );

  setCell(
    newRow,
    headerMap,
    ["Address", "Full Address"],
    body.address || ""
  );

  setCell(
    newRow,
    headerMap,
    ["Areas Serviced", "Area Serviced", "Service Area", "Areas"],
    body.areasServiced || ""
  );

  setCell(
    newRow,
    headerMap,
    ["Services Provided", "Service Provided", "Services"],
    body.servicesProvided || ""
  );

  setCell(
    newRow,
    headerMap,
    ["Employee Capacity", "Capacity", "Employees"],
    body.employeeCapacity || ""
  );

  setCell(
    newRow,
    headerMap,
    [
      "Insurance Expiration",
      "Insurance Expiration Date",
      "Insurance Exp Date",
      "Insurance",
    ],
    body.insuranceExpiration || ""
  );

  setCell(
    newRow,
    headerMap,
    ["Status", "Active Status"],
    body.status || "Active"
  );

  setCell(
    newRow,
    headerMap,
    ["Notes", "Note", "Comments"],
    body.notes || ""
  );

  const nameCol = findColumn(headerMap, [
  "Company Name",
  "Company",
  "Subcontractor",
  "Subcontractor Name",
  "Sub Name",
  "Name",
]);

let targetRow = sheet.getLastRow() + 1;

if (nameCol !== -1) {
  const lastRow = Math.max(sheet.getLastRow() - 1, 1);
  const nameValues = sheet
    .getRange(2, nameCol + 1, lastRow, 1)
    .getValues();

  let lastRealSubRow = 1;

  for (let i = 0; i < nameValues.length; i++) {
    if (String(nameValues[i][0] || "").trim() !== "") {
      lastRealSubRow = i + 2;
    }
  }

  targetRow = lastRealSubRow + 1;
}

sheet.getRange(targetRow, 1, 1, headers.length).setValues([newRow]);

return {
  success: true,
  id: newId,
  subcontractorId: newId,
  message: "Subcontractor added successfully.",
};
}

function updateSubcontractor(body) {
  const sheet = getSubcontractorsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("No subcontractors found.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);

  const idCol = findColumn(headerMap, [
    "ID",
    "Id",
    "Subcontractor ID",
    "Sub ID",
  ]);

  const targetId = String(body.id || "").trim();

  if (!targetId) {
    throw new Error("Missing subcontractor ID.");
  }

  let rowIndex = -1;

  if (idCol !== -1) {
    for (let i = 1; i < values.length; i++) {
      const rowId = String(values[i][idCol] || "").trim();

      if (rowId === targetId) {
        rowIndex = i + 1;
        break;
      }
    }
  }

  if (rowIndex === -1 && targetId.indexOf("SUB-ROW-") === 0) {
    const rowNumber = Number(targetId.replace("SUB-ROW-", ""));

    if (!isNaN(rowNumber) && rowNumber >= 2) {
      rowIndex = rowNumber;
    }
  }

  if (rowIndex === -1) {
    throw new Error("Could not find subcontractor with ID: " + targetId);
  }

  const row = values[rowIndex - 1];

  setCell(
    row,
    headerMap,
    [
      "Company Name",
      "Company",
      "Subcontractor",
      "Subcontractor Name",
      "Sub Name",
      "Name",
    ],
    body.companyName || ""
  );

  setCell(
    row,
    headerMap,
    ["Contact Name", "Contact", "Owner", "Main Contact"],
    body.contactName || ""
  );

  setCell(
    row,
    headerMap,
    ["Phone", "Phone Number", "Cell", "Cell Phone"],
    body.phone || ""
  );

  setCell(
    row,
    headerMap,
    ["Email", "Email Address"],
    body.email || ""
  );

  setCell(
    row,
    headerMap,
    ["Address", "Full Address"],
    body.address || ""
  );

  setCell(
    row,
    headerMap,
    ["Areas Serviced", "Area Serviced", "Service Area", "Areas"],
    body.areasServiced || ""
  );

  setCell(
    row,
    headerMap,
    ["Services Provided", "Service Provided", "Services"],
    body.servicesProvided || ""
  );

  setCell(
    row,
    headerMap,
    ["Employee Capacity", "Capacity", "Employees"],
    body.employeeCapacity || ""
  );

  setCell(
    row,
    headerMap,
    [
      "Insurance Expiration",
      "Insurance Expiration Date",
      "Insurance Exp Date",
      "Insurance",
    ],
    body.insuranceExpiration || ""
  );

  setCell(
    row,
    headerMap,
    ["Status", "Active Status"],
    body.status || "Active"
  );

  setCell(
    row,
    headerMap,
    ["Notes", "Note", "Comments"],
    body.notes || ""
  );

  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);

  return {
    success: true,
    id: targetId,
    message: "Subcontractor updated successfully.",
  };
}

/* =========================================================
   AUTOMATIC SUBCONTRACTOR SCORE HELPERS
========================================================= */

function getAccountsForSubScoring() {
  try {
    const accounts = getAccounts();

    return accounts.map(function (account) {
      return {
        accountName: String(account.accountName || ""),
        subcontractor: String(account.subcontractor || ""),
        status: String(account.status || ""),
      };
    });
  } catch (error) {
    return [];
  }
}

function getVisitsForSubScoring() {
  try {
    const visits = getVisits();

    return visits.map(function (visit) {
      return {
        date: String(visit.date || ""),
        accountName: String(visit.accountName || ""),
        subcontractor: String(visit.subcontractor || ""),
        condition: String(visit.condition || ""),
      };
    });
  } catch (error) {
    return [];
  }
}

function getComplaintsForSubScoring() {
  try {
    const sheet = getComplaintsSheet();
    const values = sheet.getDataRange().getValues();

    if (values.length < 2) return [];

    const headers = values[0];
    const headerMap = getHeaderMap(headers);
    const rows = values.slice(1);

    return rows
      .filter(function (row) {
        return row.join("").trim() !== "";
      })
      .map(function (row) {
        return {
          date: formatDateForApp(
            getCell(row, headerMap, ["Date", "Complaint Date"])
          ),
          accountName: String(
            getCell(row, headerMap, ["Account Name", "Account"]) || ""
          ),
          subcontractor: String(
            getCell(row, headerMap, [
              "Subcontractor",
              "Sub Contractor",
              "Cleaner",
              "Sub",
              "Sub Name",
            ]) || ""
          ),
          status: String(getCell(row, headerMap, ["Status"]) || ""),
          complaintValidity: String(
            getCell(row, headerMap, [
              "Complaint Validity",
              "Validity",
              "Valid Complaint",
            ]) || ""
          ),
        };
      });
  } catch (error) {
    return [];
  }
}

function calculateSubcontractorScore(
  subcontractorName,
  accounts,
  visits,
  complaints
) {
  const cleanSubName = normalizeMatchValue(subcontractorName);

  const assignedAccounts = accounts.filter(function (account) {
    return normalizeMatchValue(account.subcontractor) === cleanSubName;
  });

  const assignedAccountNames = assignedAccounts.map(function (account) {
    return normalizeMatchValue(account.accountName);
  });

  const relatedVisits = visits.filter(function (visit) {
    const visitSub = normalizeMatchValue(visit.subcontractor);
    const visitAccount = normalizeMatchValue(visit.accountName);

    return (
      visitSub === cleanSubName ||
      assignedAccountNames.indexOf(visitAccount) !== -1
    );
  });

  const relatedComplaints = complaints.filter(function (complaint) {
    const complaintSub = normalizeMatchValue(complaint.subcontractor);
    const complaintAccount = normalizeMatchValue(complaint.accountName);
    const validity = normalizeMatchValue(complaint.complaintValidity);

    const isInvalid =
      validity === "no" ||
      validity === "not valid" ||
      validity === "invalid" ||
      validity === "notvalid";

    if (isInvalid) return false;

    return (
      complaintSub === cleanSubName ||
      assignedAccountNames.indexOf(complaintAccount) !== -1
    );
  });

  const conditionScores = relatedVisits
    .map(function (visit) {
      return Number(visit.condition);
    })
    .filter(function (score) {
      return !isNaN(score) && score >= 0 && score <= 10;
    });

  let avgCondition = "";

  if (conditionScores.length > 0) {
    const totalCondition = conditionScores.reduce(function (sum, score) {
      return sum + score;
    }, 0);

    avgCondition = roundToOne(totalCondition / conditionScores.length);
  }

  const openComplaints = relatedComplaints.filter(function (complaint) {
    const status = normalizeMatchValue(complaint.status);

    return (
      status === "" ||
      status === "open" ||
      status === "needs review" ||
      status === "needsreview" ||
      status === "pending" ||
      status === "in progress" ||
      status === "inprogress"
    );
  });

  let score = 10;

  if (avgCondition !== "") {
    score = Number(avgCondition);
  }

  score = score - openComplaints.length * 0.5;

  if (score < 0) score = 0;
  if (score > 10) score = 10;

  score = roundToOne(score);

  let scoreStatus = "Excellent";

  if (score < 9) scoreStatus = "Good";
  if (score < 8) scoreStatus = "Needs Attention";
  if (score < 7) scoreStatus = "High Risk";

  let lastReview = "";

  if (relatedVisits.length > 0) {
    const sortedVisits = relatedVisits
      .filter(function (visit) {
        return visit.date;
      })
      .sort(function (a, b) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

    if (sortedVisits.length > 0) {
      lastReview = sortedVisits[0].date;
    }
  }

  return {
    score: score,
    scoreStatus: scoreStatus,
    complaints: openComplaints.length,
    avgCondition: avgCondition,
    accountsAssigned: assignedAccounts.length,
    lastReview: lastReview,
  };
}
function logEmailEvent(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetName = "Email Log";
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow([
        "Timestamp",
        "Account Name",
        "Account ID",
        "Email Type",
        "Sent To",
        "Subject",
        "Status",
        "Related ID",
        "Triggered By",
        "User Role",
        "Source",
        "Notes"
      ]);
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date(),
      data.accountName || "",
      data.accountId || "",
      data.emailType || "",
      data.sentTo || data.recipient || data.to || "",
      data.subject || "",
      data.status || "",
      data.relatedId || "",
      data.triggeredBy || "System",
      data.userRole || "",
      data.source || "Apps Script",
      data.notes || ""
    ]);

    return true;
  } catch (error) {
    console.error("Email log failed:", error);
    return false;
  }
}

function testEmailLogEvent() {
  logEmailEvent({
    accountName: "TEST ACCOUNT",
    accountId: "TEST-123",
    emailType: "Test Log",
    sentTo: "test@example.com",
    subject: "Testing Email Log",
    status: "Sent",
    relatedId: "TEST-123",
    triggeredBy: "System",
    userRole: "Admin",
    source: "Apps Script Test",
    notes: "This is a manual test of the Email Log function."
  });
}

function sendLoggedEmail(options) {
  const to = String(options.to || options.recipient || options.sentTo || "").trim();
  const subject = String(options.subject || "").trim();
  const body = String(options.body || options.plainBody || "").trim();
  const htmlBody = String(options.htmlBody || "").trim();

  const accountName = options.accountName || "";
  const accountId = options.accountId || "";
  const emailType = options.emailType || "General Email";
  const relatedId = options.relatedId || "";
  const triggeredBy = options.triggeredBy || "System";
  const userRole = options.userRole || "";
  const source = options.source || "Apps Script";
  const notes = options.notes || "";

  if (!to) {
    logEmailEvent({
      accountName: accountName,
      accountId: accountId,
      emailType: emailType,
      sentTo: "",
      subject: subject,
      status: "Failed",
      relatedId: relatedId,
      triggeredBy: triggeredBy,
      userRole: userRole,
      source: source,
      notes: "Missing recipient. " + notes
    });

    throw new Error("Missing email recipient.");
  }

  if (!subject) {
    logEmailEvent({
      accountName: accountName,
      accountId: accountId,
      emailType: emailType,
      sentTo: to,
      subject: "",
      status: "Failed",
      relatedId: relatedId,
      triggeredBy: triggeredBy,
      userRole: userRole,
      source: source,
      notes: "Missing subject. " + notes
    });

    throw new Error("Missing email subject.");
  }

  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body || htmlBody.replace(/<[^>]*>/g, " "),
      htmlBody: htmlBody || undefined,
      name: options.name || "Cleaning World App"
    });

    logEmailEvent({
      accountName: accountName,
      accountId: accountId,
      emailType: emailType,
      sentTo: to,
      subject: subject,
      status: "Sent",
      relatedId: relatedId,
      triggeredBy: triggeredBy,
      userRole: userRole,
      source: source,
      notes: notes
    });

    return true;
  } catch (error) {
    logEmailEvent({
      accountName: accountName,
      accountId: accountId,
      emailType: emailType,
      sentTo: to,
      subject: subject,
      status: "Failed",
      relatedId: relatedId,
      triggeredBy: triggeredBy,
      userRole: userRole,
      source: source,
      notes: String(error) + " " + notes
    });

    throw error;
  }
}
  

function getSubcontractorPortalByEmail(email) {
  const cleanEmail = normalizeMatchValue(email);

  if (!cleanEmail) {
    throw new Error("Please enter the subcontractor email on file.");
  }

  const subcontractor = findSubcontractorByEmailForPortal(cleanEmail);

  if (!subcontractor) {
    return {
      success: false,
      message:
        "We could not find that email on file. Please contact Cleaning World.",
      subcontractor: null,
      accounts: [],
      supplyItems: getSupplyItems(),
    };
  }

  const accounts = getAccounts().filter(function (account) {
    const accountSub = normalizeMatchValue(account.subcontractor);

    if (!accountSub) return false;

    const subNames = [
      subcontractor.companyName,
      subcontractor.contactName,
      subcontractor.name,
      subcontractor.subcontractorName,
    ]
      .map(function (value) {
        return normalizeMatchValue(value);
      })
      .filter(function (value) {
        return value !== "";
      });

    for (let i = 0; i < subNames.length; i++) {
      const subName = subNames[i];

      if (accountSub === subName) return true;

      if (
        accountSub.indexOf(subName) !== -1 ||
        subName.indexOf(accountSub) !== -1
      ) {
        return true;
      }
    }

    return false;
  });

const assignedAccountNames = accounts.map(function (account) {
  return normalizeMatchValue(account.accountName);
});

const complaints = getComplaints().filter(function (complaint) {
  const complaintAccount = normalizeMatchValue(complaint.accountName);
  const complaintSub = normalizeMatchValue(complaint.subcontractor);
  const status = normalizeMatchValue(complaint.status);

  const subNames = [
    subcontractor.companyName,
    subcontractor.contactName,
    subcontractor.name,
    subcontractor.subcontractorName,
  ]
    .map(function (value) {
      return normalizeMatchValue(value);
    })
    .filter(function (value) {
      return value !== "";
    });

  const belongsToAccount =
    complaintAccount && assignedAccountNames.indexOf(complaintAccount) !== -1;

  let belongsToSub = false;

  for (let i = 0; i < subNames.length; i++) {
    const subName = subNames[i];

    if (!subName || !complaintSub) continue;

    if (complaintSub === subName) {
      belongsToSub = true;
      break;
    }

    if (
      complaintSub.indexOf(subName) !== -1 ||
      subName.indexOf(complaintSub) !== -1
    ) {
      belongsToSub = true;
      break;
    }
  }

  const isClosed =
    status === "closed" ||
    status === "complete" ||
    status === "completed";

  return (belongsToAccount || belongsToSub) && !isClosed;
});

return {
  success: true,
  message: "Subcontractor portal loaded.",
  subcontractor: subcontractor,
  accounts: accounts,
  complaints: complaints,
  supplyItems: getSupplyItems(),
};

}

function findSubcontractorByEmailForPortal(email) {
  const sheet = getSubcontractorsSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return null;

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const rows = values.slice(1);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const rowEmail = normalizeMatchValue(
      getCell(row, headerMap, [
        "Email",
        "Email Address",
        "Subcontractor Email",
        "Sub Contractor Email",
        "Cleaner Email",
      ])
    );

    if (!rowEmail) continue;

    if (rowEmail === email) {
      const companyName = String(
        getCell(row, headerMap, [
          "Company Name",
          "Company",
          "Subcontractor",
          "Subcontractor Name",
          "Sub Contractor",
          "Sub Contractor Name",
          "Sub Name",
          "Name",
          "Cleaner",
          "Sub",
        ]) || ""
      ).trim();

      const contactName = String(
        getCell(row, headerMap, [
          "Contact Name",
          "Contact",
          "Owner",
          "Main Contact",
          "Name",
        ]) || ""
      ).trim();

      return {
        rowNumber: i + 2,
        id: String(
          getCell(row, headerMap, ["ID", "Subcontractor ID", "Sub ID"]) || ""
        ).trim(),
        subcontractorId: String(
          getCell(row, headerMap, ["ID", "Subcontractor ID", "Sub ID"]) || ""
        ).trim(),
        name: companyName || contactName,
        subcontractorName: companyName || contactName,
        companyName: companyName,
        contactName: contactName,
        email: String(
          getCell(row, headerMap, [
            "Email",
            "Email Address",
            "Subcontractor Email",
            "Sub Contractor Email",
            "Cleaner Email",
          ]) || ""
        ).trim(),
        phone: String(
          getCell(row, headerMap, ["Phone", "Phone Number"]) || ""
        ).trim(),
        status: String(
          getCell(row, headerMap, ["Status", "Active Status"]) || ""
        ).trim(),
      };
    }
  }

  return null;
}

function getSupplyOrders() {
  const sheet = getSupplyOrdersSheet();
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);

  return values
    .slice(1)
    .map(function (row, index) {
      const orderId = String(
        getCell(row, headerMap, ["Order ID", "OrderId", "ID", "Id"]) || ""
      ).trim();

      const subcontractor = String(
        getCell(row, headerMap, [
          "Subcontractor",
          "Subcontractor Name",
          "Company Name",
          "Cleaner",
        ]) || ""
      ).trim();

      const accountName = String(
        getCell(row, headerMap, ["Account Name", "Account", "Customer"]) || ""
      ).trim();

      const supplyItem = String(
        getCell(row, headerMap, ["Supply Item", "Supply", "Item", "Item Name"]) ||
          ""
      ).trim();

      const timestamp = getCell(row, headerMap, [
        "Timestamp",
        "Date",
        "Created At",
        "CreatedAt",
      ]);

      return {
        rowNumber: index + 2,
        timestamp: formatDateForApp(timestamp),
        orderId: orderId,
        id: orderId,
        orderGroupId: String(
          getCell(row, headerMap, [
            "Order Group ID",
            "Group ID",
            "OrderGroupId",
            "Order Group",
          ]) || ""
        ).trim(),
        subcontractor: subcontractor,
        subcontractorName: subcontractor,
        subcontractorEmail: String(
          getCell(row, headerMap, ["Subcontractor Email", "Email", "Sub Email"]) ||
            ""
        ).trim(),
        accountName: accountName,
        accountId: String(
          getCell(row, headerMap, ["Account ID", "AccountId"]) || ""
        ).trim(),
        supplyItem: supplyItem,
        item: supplyItem,
        category: String(
          getCell(row, headerMap, ["Category", "Supply Category", "Item Category"]) ||
            ""
        ).trim(),
        description: String(
          getCell(row, headerMap, [
            "Description",
            "Item Description",
            "Supply Description",
          ]) || ""
        ).trim(),
        quantity: String(getCell(row, headerMap, ["Quantity", "Qty"]) || "").trim(),
        unit: String(getCell(row, headerMap, ["Unit", "Units", "UOM"]) || "").trim(),
        deliveryMode: String(
          getCell(row, headerMap, ["Delivery Mode", "Delivery", "Pickup Delivery"]) ||
            ""
        ).trim(),
        status: String(
          getCell(row, headerMap, ["Status", "Order Status"]) || "New"
        ).trim(),
        notes: String(
          getCell(row, headerMap, ["Notes", "Note", "Comments"]) || ""
        ).trim(),
      };
    })
    .filter(function (order) {
      return (
        order.orderId ||
        order.subcontractor ||
        order.accountName ||
        order.supplyItem
      );
    })
    .reverse();
}

function submitSupplyOrder(body) {
  const orderGroupId = String(body.orderGroupId || "").trim();

  const subcontractorEmail = String(body.subcontractorEmail || body.email || "")
    .trim();

  const subcontractorName = String(
    body.subcontractorName || body.name || ""
  ).trim();

  const accountId = String(body.accountId || "").trim();
  const accountName = String(body.accountName || "").trim();

  const supplyItem = String(body.supplyItem || body.item || "").trim();

  const category = String(
    body.category ||
      body.supplyCategory ||
      body.itemCategory ||
      ""
  ).trim();

  const itemDescription = String(
    body.itemDescription ||
      body.description ||
      body.supplyDescription ||
      ""
  ).trim();

  const quantity = String(body.quantity || "").trim();
  const unit = String(body.unit || "").trim();
  const deliveryMode = String(body.deliveryMode || "").trim();
  const notes = String(body.notes || "").trim();

  const requestedStatus = String(body.status || "").trim();
  const status = requestedStatus || "New";

  if (!subcontractorEmail) {
    throw new Error("Missing subcontractor email.");
  }

  if (!subcontractorName) {
    throw new Error("Missing subcontractor name.");
  }

  if (!accountName) {
    throw new Error("Please select an account.");
  }

  if (!supplyItem) {
    throw new Error("Please select a supply item.");
  }

  if (!quantity) {
    throw new Error("Please enter a quantity.");
  }

  if (!deliveryMode) {
    throw new Error("Please select Pick Up or Deliver to Account.");
  }

  const sheet = getSupplyOrdersSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("Supply Orders sheet has no headers.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const newRow = new Array(headers.length).fill("");

  const orderId = generateId("SUPORD");

  const now = new Date();
  const timestamp = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "M/d/yyyy H:mm:ss"
  );

  setCell(newRow, headerMap, ["Timestamp", "Created At", "CreatedAt"], timestamp);
  setCell(newRow, headerMap, ["Order ID", "ID"], orderId);

  setCell(
    newRow,
    headerMap,
    ["Order Group ID", "Group ID", "OrderGroupId", "Order Group"],
    orderGroupId
  );

  setCell(
    newRow,
    headerMap,
    ["Subcontractor", "Subcontractor Name", "Sub Contractor", "Cleaner"],
    subcontractorName
  );

  setCell(
    newRow,
    headerMap,
    ["Subcontractor Email", "Email"],
    subcontractorEmail
  );

  setCell(newRow, headerMap, ["Account Name", "Account"], accountName);
  setCell(newRow, headerMap, ["Account ID", "AccountId"], accountId);

  setCell(
    newRow,
    headerMap,
    ["Supply Item", "Item", "Item Name", "Supply"],
    supplyItem
  );

  setCell(
    newRow,
    headerMap,
    ["Category", "Supply Category", "Item Category"],
    category
  );

  setCell(
    newRow,
    headerMap,
    ["Description", "Item Description", "Supply Description"],
    itemDescription
  );

  setCell(newRow, headerMap, ["Quantity", "Qty"], quantity);
  setCell(newRow, headerMap, ["Unit", "Units", "UOM"], unit);

  setCell(
    newRow,
    headerMap,
    ["Delivery Mode", "Delivery", "Pickup Delivery"],
    deliveryMode
  );

  setCell(newRow, headerMap, ["Notes", "Note", "Comments"], notes);
  setCell(newRow, headerMap, ["Status", "Order Status"], status);

  setCell(
    newRow,
    headerMap,
    ["Email Sent To", "Sent To"],
    INTERNAL_NOTIFICATION_EMAIL
  );

  setCell(newRow, headerMap, ["Email Status"], "Pending");

  sheet.appendRow(newRow);

  const emailSent = sendSupplyOrderNotificationEmail({
    orderId: orderId,
    orderGroupId: orderGroupId,
    timestamp: timestamp,
    subcontractorEmail: subcontractorEmail,
    subcontractorName: subcontractorName,
    accountId: accountId,
    accountName: accountName,
    supplyItem: supplyItem,
    category: category,
    description: itemDescription,
    itemDescription: itemDescription,
    quantity: quantity,
    unit: unit,
    deliveryMode: deliveryMode,
    notes: notes,
    status: status,
  });

  const lastRow = sheet.getLastRow();
  const emailStatusCol = findColumn(headerMap, ["Email Status"]);

  if (emailStatusCol !== -1) {
    sheet
      .getRange(lastRow, emailStatusCol + 1)
      .setValue(emailSent ? "Sent" : "Failed");
  }

  return {
    success: true,
    id: orderId,
    orderId: orderId,
    orderGroupId: orderGroupId,
    message: "Supply order submitted successfully.",
  };
}
function updateSupplyOrderStatus(body) {
  const rowNumber = Number(body.rowNumber || 0);
  const orderId = String(body.orderId || body.id || "").trim();
  const newStatus = String(body.status || body.orderStatus || "").trim();

  if (!newStatus) {
    throw new Error("Missing new status.");
  }

  const allowedStatuses = [
    "New",
    "Needs Review",
    "Approved",
    "Pending / In Progress",
    "Completed",
    "Denied",
    "Cancelled",
  ];

  if (allowedStatuses.indexOf(newStatus) === -1) {
    throw new Error("Invalid supply order status: " + newStatus);
  }

  const sheet = getSupplyOrdersSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("No supply orders found.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);

  const statusCol = findColumn(headerMap, ["Status", "Order Status"]);

  if (statusCol === -1) {
    throw new Error("Status column was not found in Supply Orders sheet.");
  }

  let targetRow = rowNumber;

  if (!targetRow && orderId) {
    const orderIdCol = findColumn(headerMap, ["Order ID", "ID"]);

    if (orderIdCol === -1) {
      throw new Error("Order ID column was not found.");
    }

    for (let i = 1; i < values.length; i++) {
      const existingOrderId = String(values[i][orderIdCol] || "").trim();

      if (existingOrderId === orderId) {
        targetRow = i + 1;
        break;
      }
    }
  }

  if (!targetRow || targetRow < 2) {
    throw new Error("Could not find the supply order row to update.");
  }

  sheet.getRange(targetRow, statusCol + 1).setValue(newStatus);

  const updatedAtCol = findColumn(headerMap, [
    "Last Updated",
    "Updated At",
    "UpdatedAt",
  ]);

  if (updatedAtCol !== -1) {
    const now = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "M/d/yyyy H:mm:ss"
    );

    sheet.getRange(targetRow, updatedAtCol + 1).setValue(now);
  }

  return {
    success: true,
    message: "Supply order status updated.",
    rowNumber: targetRow,
    orderId: orderId,
    status: newStatus,
  };
}

function sendSupplyOrderNotificationEmail(order) {
  const subject = "New Supply Order - " + order.accountName;

  const rows = [
    { label: "Order ID", value: order.orderId },
    { label: "Submitted", value: order.timestamp },
    { label: "Subcontractor", value: order.subcontractorName },
    { label: "Subcontractor Email", value: order.subcontractorEmail },
    { label: "Account", value: order.accountName },
    { label: "Supply Item", value: order.supplyItem },
    { label: "Quantity", value: order.quantity },
    { label: "Unit", value: order.unit },
    { label: "Delivery Mode", value: order.deliveryMode },
    { label: "Notes", value: order.notes },
    { label: "Status", value: "New" },
  ];

  const emailSent = sendInternalNotificationEmail(
    subject,
    "New Supply Order Submitted",
    rows
  );

  if (typeof logEmailEvent === "function") {
    logEmailEvent({
      accountName: order.accountName,
      accountId: order.accountId || "",
      emailType: "Supply Order Notification",
      sentTo: INTERNAL_NOTIFICATION_EMAIL,
      subject: subject,
      status: emailSent ? "Sent" : "Failed",
      relatedId: order.orderId,
      triggeredBy: order.subcontractorName || "Subcontractor Portal",
      userRole: "Subcontractor",
      source: "Apps Script - submitSupplyOrder",
      notes:
        "Supply order submitted by " +
        order.subcontractorName +
        " for " +
        order.accountName +
        ".",
    });
  }

  return emailSent;
}
function getSupplyItems() {
  try {
    const sheet = getSuppliesSheet();
    const values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      return [];
    }

    const headers = values[0];
    const headerMap = getHeaderMap(headers);
    const rows = values.slice(1);

    return rows
      .filter(function (row) {
        const supplyItem = String(
          getCell(row, headerMap, [
            "Supply Item",
            "Item",
            "Item Name",
            "Supply",
            "Name",
          ]) || ""
        ).trim();

        return supplyItem !== "";
      })
      .map(function (row, index) {
        const supplyItem = String(
          getCell(row, headerMap, [
            "Supply Item",
            "Item",
            "Item Name",
            "Supply",
            "Name",
          ]) || ""
        ).trim();

        const category = String(
          getCell(row, headerMap, ["Category", "Type"]) || ""
        ).trim();

        const description = String(
          getCell(row, headerMap, [
            "Description",
            "Item Description",
            "Supply Description",
          ]) || ""
        ).trim();

        const unit = String(
          getCell(row, headerMap, ["Unit", "Units", "UOM"]) || ""
        ).trim();

        const notes = String(
          getCell(row, headerMap, ["Notes", "Note", "Comments"]) || ""
        ).trim();

        const status = String(
          getCell(row, headerMap, [
            "Status",
            "Supply Status",
            "Item Status",
          ]) || ""
        ).trim();

        const active = String(
          getCell(row, headerMap, [
            "Active",
            "Is Active",
            "Active Status",
          ]) || ""
        ).trim();

        return {
          rowNumber: index + 2,
          supplyItem: supplyItem,
          category: category,

          // Important for subcontractor portal item description box
          description: description,
          itemDescription: description,

          unit: unit,
          notes: notes,
          status: status,
          active: active,
        };
      })
      .filter(function (item) {
        const status = String(item.status || "").trim().toLowerCase();
        const active = String(item.active || "").trim().toLowerCase();

        if (status) {
          return status === "active";
        }

        if (active) {
          return active === "yes" || active === "true" || active === "active";
        }

        return true;
      });
  } catch (error) {
    return [];
  }
}

function addSupplyItem(body) {
  const sheet = getSuppliesSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length === 0) {
    throw new Error("Supplies sheet has no headers.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const newRow = new Array(headers.length).fill("");

  const supplyItem = String(
    body.supplyItem || body.item || body.itemName || body.supply || body.name || ""
  ).trim();

  if (!supplyItem) {
    throw new Error("Missing supply item name.");
  }

  const newId = generateId("SUPPLY");

  const now = new Date();
  const timestamp = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "M/d/yyyy H:mm:ss"
  );

  setCell(newRow, headerMap, ["Supply ID", "ID", "Item ID"], newId);

  setCell(
    newRow,
    headerMap,
    ["Supply Item", "Item", "Item Name", "Supply", "Name"],
    supplyItem
  );

  setCell(newRow, headerMap, ["Category", "Type"], body.category || "");
  setCell(newRow, headerMap, ["Unit", "Units", "UOM"], body.unit || "");
  setCell(
    newRow,
    headerMap,
    ["Active", "Status", "Active Status"],
    body.active || "Yes"
  );

  setCell(
    newRow,
    headerMap,
    ["Current Stock", "CurrentStock", "Stock", "Qty On Hand", "Quantity On Hand"],
    body.currentStock || ""
  );

  setCell(
    newRow,
    headerMap,
    ["Minimum Stock", "MinimumStock", "Min Stock", "Reorder Point"],
    body.minimumStock || ""
  );

  setCell(
    newRow,
    headerMap,
    ["Notes", "Note", "Comments"],
    body.notes || ""
  );

  setCell(
    newRow,
    headerMap,
    ["Last Updated", "LastUpdated", "Updated At", "UpdatedAt"],
    timestamp
  );

  sheet.appendRow(newRow);

  return {
    success: true,
    id: newId,
    supplyId: newId,
    message: "Supply item added successfully.",
  };
}

function updateSupplyItem(body) {
  const sheet = getSuppliesSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("No supply items found.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);

  const rowNumber = findSupplyItemRowNumber(sheet, values, headerMap, body);

  if (rowNumber === -1) {
    throw new Error("Could not find supply item to update.");
  }

  const row = values[rowNumber - 1];

  const now = new Date();
  const timestamp = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "M/d/yyyy H:mm:ss"
  );

  const finalId = String(
    getCell(row, headerMap, ["Supply ID", "ID", "Item ID"]) ||
      body.supplyId ||
      body.id ||
      generateId("SUPPLY")
  ).trim();

  const finalSupplyItem = String(
    getSupplyBodyValue(
      body,
      ["supplyItem", "item", "itemName", "supply", "name"],
      getCell(row, headerMap, ["Supply Item", "Item", "Item Name", "Supply", "Name"])
    )
  ).trim();

  if (!finalSupplyItem) {
    throw new Error("Missing supply item name.");
  }

  setCell(row, headerMap, ["Supply ID", "ID", "Item ID"], finalId);

  setCell(
    row,
    headerMap,
    ["Supply Item", "Item", "Item Name", "Supply", "Name"],
    finalSupplyItem
  );

  setCell(
    row,
    headerMap,
    ["Category", "Type"],
    getSupplyBodyValue(
      body,
      ["category", "type"],
      getCell(row, headerMap, ["Category", "Type"])
    )
  );

  setCell(
    row,
    headerMap,
    ["Unit", "Units", "UOM"],
    getSupplyBodyValue(
      body,
      ["unit", "units", "uom"],
      getCell(row, headerMap, ["Unit", "Units", "UOM"])
    )
  );

  setCell(
    row,
    headerMap,
    ["Active", "Status", "Active Status"],
    getSupplyBodyValue(
      body,
      ["active", "status"],
      getCell(row, headerMap, ["Active", "Status", "Active Status"]) || "Yes"
    )
  );

  setCell(
    row,
    headerMap,
    ["Current Stock", "CurrentStock", "Stock", "Qty On Hand", "Quantity On Hand"],
    getSupplyBodyValue(
      body,
      ["currentStock", "stock", "qtyOnHand", "quantityOnHand"],
      getCell(row, headerMap, [
        "Current Stock",
        "CurrentStock",
        "Stock",
        "Qty On Hand",
        "Quantity On Hand",
      ])
    )
  );

  setCell(
    row,
    headerMap,
    ["Minimum Stock", "MinimumStock", "Min Stock", "Reorder Point"],
    getSupplyBodyValue(
      body,
      ["minimumStock", "minStock", "reorderPoint"],
      getCell(row, headerMap, [
        "Minimum Stock",
        "MinimumStock",
        "Min Stock",
        "Reorder Point",
      ])
    )
  );

  setCell(
    row,
    headerMap,
    ["Notes", "Note", "Comments"],
    getSupplyBodyValue(
      body,
      ["notes", "note", "comments"],
      getCell(row, headerMap, ["Notes", "Note", "Comments"])
    )
  );

  setCell(
    row,
    headerMap,
    ["Last Updated", "LastUpdated", "Updated At", "UpdatedAt"],
    timestamp
  );

  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);

  return {
    success: true,
    id: finalId,
    supplyId: finalId,
    rowNumber: rowNumber,
    message: "Supply item updated successfully.",
  };
}

function deactivateSupplyItem(body) {
  const sheet = getSuppliesSheet();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("No supply items found.");
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);

  const rowNumber = findSupplyItemRowNumber(sheet, values, headerMap, body);

  if (rowNumber === -1) {
    throw new Error("Could not find supply item to remove.");
  }

  const row = values[rowNumber - 1];

  const now = new Date();
  const timestamp = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "M/d/yyyy H:mm:ss"
  );

  setCell(row, headerMap, ["Active", "Status", "Active Status"], "No");

  setCell(
    row,
    headerMap,
    ["Last Updated", "LastUpdated", "Updated At", "UpdatedAt"],
    timestamp
  );

  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);

  return {
    success: true,
    rowNumber: rowNumber,
    message: "Supply item deactivated successfully.",
  };
}

function getSupplyBodyValue(body, possibleKeys, fallbackValue) {
  for (let i = 0; i < possibleKeys.length; i++) {
    const key = possibleKeys[i];

    if (body[key] !== undefined && body[key] !== null) {
      return body[key];
    }
  }

  return fallbackValue;
}

function findSupplyItemRowNumber(sheet, values, headerMap, body) {
  const requestedRowNumber = Number(body.rowNumber || 0);

  if (requestedRowNumber >= 2 && requestedRowNumber <= sheet.getLastRow()) {
    return requestedRowNumber;
  }

  const requestedId = String(
    body.supplyId || body.id || body.itemId || ""
  ).trim();
  const requestedName = normalizeMatchValue(
    body.supplyItem || body.item || body.itemName || body.supply || body.name || ""
  );

  const idCol = findColumn(headerMap, ["Supply ID", "ID", "Item ID"]);
  const nameCol = findColumn(headerMap, [
    "Supply Item",
    "Item",
    "Item Name",
    "Supply",
    "Name",
  ]);

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowId = idCol !== -1 ? String(row[idCol] || "").trim() : "";
    const rowName = nameCol !== -1 ? normalizeMatchValue(row[nameCol]) : "";

    if (requestedId && rowId === requestedId) {
      return i + 1;
    }

    if (requestedName && rowName === requestedName) {
      return i + 1;
    }
  }

  return -1;
}

function formatDateValue(value) {
  return formatDateForApp(value);
}

function getToDos() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("To Do");

  if (!sheet) {
    return {
      success: true,
      todos: [],
    };
  }

  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return {
      success: true,
      todos: [],
    };
  }

  const headers = values[0].map(function (header) {
    return String(header || "").trim();
  });

  const rows = values.slice(1);

  function getValue(row, possibleHeaders) {
    for (var i = 0; i < possibleHeaders.length; i++) {
      const possibleHeader = String(possibleHeaders[i] || "")
        .toLowerCase()
        .trim();

      const index = headers.findIndex(function (header) {
        return String(header || "").toLowerCase().trim() === possibleHeader;
      });

      if (index !== -1) {
        return row[index] || "";
      }
    }

    return "";
  }

  const todos = rows
    .filter(function (row) {
      return row.some(function (cell) {
        return cell !== "" && cell !== null;
      });
    })
    .map(function (row) {
      return {
        id: getValue(row, ["To Do ID"]),
        createdDate: formatDateValue(getValue(row, ["Created Date"])),
        dueDate: formatDateValue(getValue(row, ["Due Date"])),
        assignedTo: getValue(row, ["Assigned to", "Assigned To"]),
        accountName: getValue(row, ["Account", "Account Name"]),
        taskType: getValue(row, ["Task Type"]),
        why: getValue(row, ["Why"]),
        status: getValue(row, ["Status"]) || "Open",
        notes: getValue(row, ["Notes"]),
      };
    });

  return {
    success: true,
    todos: todos,
  };
}

function addToDo(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("To Do");

  if (!sheet) {
    sheet = ss.insertSheet("To Do");
    sheet.appendRow([
      "To Do ID",
      "Created Date",
      "Due Date",
      "Assigned to",
      "Account",
      "Task Type",
      "Why",
      "Status",
      "Notes",
    ]);
  }

  const now = new Date();
  const toDoId = generateId("TODO");

  sheet.appendRow([
    toDoId,
    now,
    data.dueDate || "",
    data.assignedTo || "",
    data.accountName || "",
    data.taskType || "Visit",
    data.why || "",
    data.status || "Open",
    data.notes || "",
  ]);

  return {
    success: true,
    message: "To-do created successfully.",
    toDoId: toDoId,
  };
}

function updateToDoStatus(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("To Do");

  if (!sheet) {
    return {
      success: false,
      message: "To Do sheet not found.",
    };
  }

  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return {
      success: false,
      message: "No to-dos found.",
    };
  }

  const headers = values[0].map(function (header) {
    return String(header || "").trim();
  });

  function findColumn(possibleHeaders) {
    for (var i = 0; i < possibleHeaders.length; i++) {
      const possibleHeader = String(possibleHeaders[i] || "")
        .toLowerCase()
        .trim();

      const index = headers.findIndex(function (header) {
        return String(header || "").toLowerCase().trim() === possibleHeader;
      });

      if (index !== -1) {
        return index;
      }
    }

    return -1;
  }

  const idCol = findColumn(["To Do ID"]);
  const statusCol = findColumn(["Status"]);
  const notesCol = findColumn(["Notes"]);

  if (idCol === -1 || statusCol === -1) {
    return {
      success: false,
      message: "Required To Do columns missing.",
    };
  }

  for (var r = 1; r < values.length; r++) {
    const rowId = String(values[r][idCol] || "").trim();

    if (rowId === String(data.toDoId || "").trim()) {
      const rowNumber = r + 1;

      sheet.getRange(rowNumber, statusCol + 1).setValue(data.status || "Done");

      if (notesCol !== -1 && data.notes !== undefined) {
        sheet.getRange(rowNumber, notesCol + 1).setValue(data.notes || "");
      }

      return {
        success: true,
        message: "To-do updated successfully.",
      };
    }
  }

  return {
    success: false,
    message: "To-do not found.",
  };
}
/* =========================================================
   ACCOUNT COORDINATES / MAP PINS
   Purpose:
   - Reads Accounts sheet
   - Finds rows missing Latitude / Longitude
   - Uses Google Maps geocoding through Apps Script
   - Saves Latitude and Longitude back to the sheet
   - Runs in small batches to avoid limits
========================================================= */

function geocodeMissingAccountCoordinates() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Accounts");

  if (!sheet) {
    throw new Error("Accounts sheet not found.");
  }

  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    Logger.log("No account rows found.");
    return;
  }

  const headers = values[0].map(function (header) {
    return String(header || "").trim();
  });

  function findColumn(possibleNames) {
    for (var i = 0; i < possibleNames.length; i++) {
      const wanted = String(possibleNames[i] || "").toLowerCase().trim();

      for (var j = 0; j < headers.length; j++) {
        const current = String(headers[j] || "").toLowerCase().trim();

        if (current === wanted) {
          return j;
        }
      }
    }

    return -1;
  }

  const accountNameCol = findColumn([
    "Account Name",
    "Account",
    "Name",
  ]);

  const addressCol = findColumn([
    "Address",
    "Service Address",
    "Account Address",
  ]);

  const cityCol = findColumn([
    "City",
  ]);

  const stateCol = findColumn([
    "State",
  ]);

  const zipCol = findColumn([
    "Zip",
    "ZIP",
    "Zip Code",
  ]);

  const latitudeCol = findColumn([
    "Latitude",
    "Lat",
  ]);

  const longitudeCol = findColumn([
    "Longitude",
    "Lng",
    "Long",
  ]);

  if (addressCol === -1) {
    throw new Error("Address column not found in Accounts sheet.");
  }

  if (latitudeCol === -1 || longitudeCol === -1) {
    throw new Error(
      "Latitude and Longitude columns must be added to the Accounts sheet."
    );
  }

  const MAX_ROWS_PER_RUN = 25;
  var updatedCount = 0;
  var skippedCount = 0;
  var failedCount = 0;

  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (updatedCount >= MAX_ROWS_PER_RUN) {
      Logger.log("Stopped after " + MAX_ROWS_PER_RUN + " updates to avoid limits.");
      break;
    }

    const row = values[rowIndex];

    const existingLatitude = row[latitudeCol];
    const existingLongitude = row[longitudeCol];

    if (existingLatitude && existingLongitude) {
      skippedCount++;
      continue;
    }

    const accountName =
      accountNameCol !== -1 ? String(row[accountNameCol] || "").trim() : "";

    const address =
      addressCol !== -1 ? String(row[addressCol] || "").trim() : "";

    const city =
      cityCol !== -1 ? String(row[cityCol] || "").trim() : "";

    const state =
      stateCol !== -1 ? String(row[stateCol] || "").trim() : "";

    const zip =
      zipCol !== -1 ? String(row[zipCol] || "").trim() : "";

    const fullAddress = [address, city, state, zip]
      .filter(function (part) {
        return part && String(part).trim() !== "";
      })
      .join(", ");

    if (!fullAddress) {
      Logger.log("Skipping row " + (rowIndex + 1) + ": missing address.");
      skippedCount++;
      continue;
    }

    try {
      const geocoder = Maps.newGeocoder();
      const response = geocoder.geocode(fullAddress);

      if (
        response &&
        response.status === "OK" &&
        response.results &&
        response.results.length > 0
      ) {
        const location = response.results[0].geometry.location;

        sheet.getRange(rowIndex + 1, latitudeCol + 1).setValue(location.lat);
        sheet.getRange(rowIndex + 1, longitudeCol + 1).setValue(location.lng);

        updatedCount++;

        Logger.log(
          "Updated row " +
            (rowIndex + 1) +
            " - " +
            accountName +
            " - " +
            fullAddress +
            " => " +
            location.lat +
            ", " +
            location.lng
        );

        Utilities.sleep(200);
      } else {
        failedCount++;

        Logger.log(
          "Could not geocode row " +
            (rowIndex + 1) +
            " - " +
            accountName +
            " - " +
            fullAddress +
            " - Status: " +
            (response ? response.status : "No response")
        );
      }
    } catch (error) {
      failedCount++;

      Logger.log(
        "Error geocoding row " +
          (rowIndex + 1) +
          " - " +
          accountName +
          ": " +
          error
      );
    }
  }

  Logger.log("Geocoding complete.");
  Logger.log("Updated: " + updatedCount);
  Logger.log("Skipped: " + skippedCount);
  Logger.log("Failed: " + failedCount);
}

/* =========================================================
   END OF CLEANING WORLD APPS SCRIPT
========================================================= */
/* =========================================================
   SUBCONTRACTOR TRANSFER PROPOSALS
   Safe version - creates/sends proposal only.
   It does NOT move accounts.
========================================================= */

function getSubTransferProposalSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = "Sub Transfer Proposals";
  let sheet = ss.getSheetByName(sheetName);

  const headers = [
    "Proposal ID",
    "Created At",
    "Status",
    "New Subcontractor",
    "New Subcontractor Email",
    "Account Name",
    "Address",
    "Cleaning Days",
    "Scope",
    "Keys / Alarm",
    "Proposed Monthly Pay",
    "Accepted At",
    "Declined At",
    "Notes",
    "Sent At"
  ];

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function normalizeTransferText(value) {
  return String(value || "").trim();
}

function parseTransferMoney(value) {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;

  const cleaned = String(value)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

  const parsed = Number(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function getTransferAccountId(account) {
  return normalizeTransferText(
    account.accountId ||
      account.id ||
      account.rowNumber ||
      account.accountName
  );
}

function getTransferKeysAlarmYesNo(account) {
  const values = [
    account.keysAlarmRequired,
    account.keysAlarm,
    account.hasKey,
    account.alarmCode,
    account.keyAlarmAccessInfo
  ]
    .map(function (v) {
      return normalizeTransferText(v).toLowerCase();
    })
    .filter(String);

  if (values.length === 0) return "No";

  const combined = values.join(" ");

  if (
    combined.includes("yes") ||
    combined.includes("key") ||
    combined.includes("alarm") ||
    combined.includes("code") ||
    combined.includes("has")
  ) {
    return "Yes";
  }

  return "No";
}

function normalizeAccountKeyForTransfer(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function findAccountsForTransferProposal(accountNames) {
  const wantedNames = String(accountNames || "")
    .split(",")
    .map(function (name) {
      return normalizeAccountKeyForTransfer(name);
    })
    .filter(String);

  if (wantedNames.length === 0) {
    return [];
  }

  const accounts = getAllAccounts();
  const selected = [];

  accounts.forEach(function (account) {
    const accountKey = normalizeAccountKeyForTransfer(account.accountName);

    wantedNames.forEach(function (wantedKey) {
      if (!accountKey || !wantedKey) return;

      if (
        accountKey === wantedKey ||
        accountKey.indexOf(wantedKey) !== -1 ||
        wantedKey.indexOf(accountKey) !== -1
      ) {
        const exists = selected.some(function (selectedAccount) {
          return selectedAccount.accountName === account.accountName;
        });

        if (!exists) {
          selected.push(account);
        }
      }
    });
  });

  return selected;
}

function getTransferAccountsFromBody(body) {
  if (Array.isArray(body.accounts) && body.accounts.length > 0) {
    return body.accounts.map(function (account) {
      return {
        accountId: getTransferAccountId(account),
        accountName: normalizeTransferText(account.accountName || account.name),
        address: normalizeTransferText(account.address),
        cleaningDays: normalizeTransferText(
          account.cleaningDays || account.frequency
        ),
        scope: normalizeTransferText(
          account.scope || account.scopeOfWork || account.serviceType
        ),
        keysAlarm: getTransferKeysAlarmYesNo(account),
        proposedMonthlyPay: parseTransferMoney(
          account.proposedMonthlyPay ||
            account.proposedPay ||
            account.monthlySubcontractorPay ||
            account.subcontractorPay
        )
      };
    });
  }

  const foundAccounts = findAccountsForTransferProposal(body.accountNames || "");

  if (foundAccounts.length === 0) {
    throw new Error("No accounts selected or matching accounts found.");
  }

  const totalPay = parseTransferMoney(body.proposedTotalSubPay);
  const payPerAccount =
    foundAccounts.length > 0 ? totalPay / foundAccounts.length : 0;

  return foundAccounts.map(function (account) {
    return {
      accountId: getTransferAccountId(account),
      accountName: normalizeTransferText(account.accountName),
      address: normalizeTransferText(account.address),
      cleaningDays: normalizeTransferText(
        account.cleaningDays || account.frequency
      ),
      scope: normalizeTransferText(
        account.scopeOfWork || account.scope || account.serviceType
      ),
      keysAlarm: getTransferKeysAlarmYesNo(account),
      proposedMonthlyPay:
        payPerAccount ||
        parseTransferMoney(
          account.monthlySubcontractorPay || account.subcontractorPay
        )
    };
  });
}

function createSubTransferProposal(body) {
  const sheet = getSubTransferProposalSheet();

  const proposalId = body.proposalId || generateId("TRANSFER");
  const createdAt = new Date();

  const newSubcontractor = normalizeTransferText(
    body.newSubcontractor || body.subcontractorName
  );

  const newSubcontractorEmail = normalizeTransferText(
    body.newSubcontractorEmail || body.subcontractorEmail || body.email
  );

  const notes = normalizeTransferText(body.notes);
  const selectedAccounts = getTransferAccountsFromBody(body);

  if (!newSubcontractor) {
    throw new Error("Missing new subcontractor name.");
  }

  if (selectedAccounts.length === 0) {
    throw new Error("No accounts selected.");
  }

  selectedAccounts.forEach(function (account) {
    sheet.appendRow([
      proposalId,
      createdAt,
      "Draft",
      newSubcontractor,
      newSubcontractorEmail,
      account.accountName,
      account.address,
      account.cleaningDays,
      account.scope,
      account.keysAlarm,
      account.proposedMonthlyPay,
      "",
      "",
      notes,
      ""
    ]);
  });

  return {
    success: true,
    proposalId: proposalId,
    newSubcontractor: newSubcontractor,
    newSubcontractorEmail: newSubcontractorEmail,
    accounts: selectedAccounts,
    accountNames: selectedAccounts
      .map(function (account) {
        return account.accountName;
      })
      .join(", "),
    accountIds: selectedAccounts
      .map(function (account) {
        return account.accountId;
      })
      .filter(String)
      .join(", "),
    notes: notes
  };
}

function sendSubTransferProposalEmail(proposal) {
  try {
    var subcontractorName =
      proposal.newSubcontractor ||
      proposal.subcontractorName ||
      proposal.subName ||
      proposal.subcontractor ||
      proposal.companyName ||
      "Subcontractor";

    var subcontractorEmail =
      proposal.newSubcontractorEmail ||
      proposal.subcontractorEmail ||
      proposal.subEmail ||
      proposal.email ||
      proposal.toEmail ||
      "";

    if (!subcontractorEmail && subcontractorName) {
      subcontractorEmail = findSubcontractorEmailByName(subcontractorName);
    }

    if (!subcontractorEmail) {
      return {
        success: false,
        message: "Subcontractor email is missing.",
        subcontractorNameReceived: subcontractorName,
        proposalReceived: proposal,
      };
    }

    var accounts = Array.isArray(proposal.accounts) ? proposal.accounts : [];

    var proposalId =
      proposal.proposalId ||
      proposal.id ||
      "Proposal";

    var webAppUrl = ScriptApp.getService().getUrl();

    function money(value) {
      var number = Number(
        String(value || 0)
          .replace(/\$/g, "")
          .replace(/,/g, "")
          .trim()
      );

      if (isNaN(number)) number = 0;

      return number;
    }

    function formatMoney(value) {
      return "$" + money(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }

    var totalProposedPay = money(
      proposal.totalProposedPay ||
        proposal.totalMonthlyPay ||
        proposal.totalSubPay ||
        proposal.proposedMonthlyPay ||
        0
    );

    if (totalProposedPay === 0 && accounts.length > 0) {
      totalProposedPay = accounts.reduce(function (total, account) {
        return (
          total +
          money(
            account.proposedMonthlyPay ||
              account.proposedPay ||
              account.subPay ||
              account.monthlySubcontractorPay ||
              0
          )
        );
      }, 0);
    }

    var plainAccountLines = accounts
      .map(function (account, index) {
        var accountName = account.accountName || account.name || "Account";
        var address = account.address || account.accountAddress || "";
        var cleaningDays = account.cleaningDays || account.frequency || "";
        var scope = account.scope || account.scopeOfWork || account.serviceType || "";
        var keysAlarm = account.keysAlarm || account.keysAlarmRequired || account.hasKey || "No";

        var proposedPay = money(
          account.proposedMonthlyPay ||
            account.proposedPay ||
            account.subPay ||
            account.monthlySubcontractorPay ||
            0
        );

        var acceptUrl =
          webAppUrl +
          "?action=respondSubTransferProposal" +
          "&proposalId=" +
          encodeURIComponent(proposalId) +
          "&accountName=" +
          encodeURIComponent(accountName) +
          "&response=accepted";

        var declineUrl =
          webAppUrl +
          "?action=respondSubTransferProposal" +
          "&proposalId=" +
          encodeURIComponent(proposalId) +
          "&accountName=" +
          encodeURIComponent(accountName) +
          "&response=declined";

        return (
          index + 1 + ". " + accountName + "\n" +
          "Address: " + (address || "-") + "\n" +
          "Cleaning Days: " + (cleaningDays || "-") + "\n" +
          "Scope: " + (scope || "-") + "\n" +
          "Keys / Alarm Required: " + (keysAlarm || "No") + "\n" +
          "Proposed Monthly Pay: " + formatMoney(proposedPay) + "\n" +
          "Accept this account: " + acceptUrl + "\n" +
          "Decline this account: " + declineUrl + "\n"
        );
      })
      .join("\n");

    var htmlAccountCards = accounts
      .map(function (account, index) {
        var accountName = account.accountName || account.name || "Account";
        var address = account.address || account.accountAddress || "";
        var cleaningDays = account.cleaningDays || account.frequency || "";
        var scope = account.scope || account.scopeOfWork || account.serviceType || "";
        var keysAlarm = account.keysAlarm || account.keysAlarmRequired || account.hasKey || "No";

        var proposedPay = money(
          account.proposedMonthlyPay ||
            account.proposedPay ||
            account.subPay ||
            account.monthlySubcontractorPay ||
            0
        );

        var acceptUrl =
          webAppUrl +
          "?action=respondSubTransferProposal" +
          "&proposalId=" +
          encodeURIComponent(proposalId) +
          "&accountName=" +
          encodeURIComponent(accountName) +
          "&response=accepted";

        var declineUrl =
          webAppUrl +
          "?action=respondSubTransferProposal" +
          "&proposalId=" +
          encodeURIComponent(proposalId) +
          "&accountName=" +
          encodeURIComponent(accountName) +
          "&response=declined";

        return (
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:16px;margin-bottom:16px;">' +
          '<tr>' +
          '<td style="padding:22px;vertical-align:top;">' +
          '<div style="font-size:12px;color:#94a3b8;font-weight:700;margin-bottom:6px;">ACCOUNT ' + (index + 1) + '</div>' +
          '<div style="font-size:19px;font-weight:900;color:#0f172a;margin-bottom:4px;">' + escapeHtml(accountName) + '</div>' +
          '<div style="font-size:13px;color:#64748b;margin-bottom:16px;">' + escapeHtml(address || "-") + '</div>' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#334155;">' +
          '<tr><td style="padding:4px 0;color:#94a3b8;width:90px;">Days</td><td style="padding:4px 0;">' + escapeHtml(cleaningDays || "-") + '</td></tr>' +
          '<tr><td style="padding:4px 0;color:#94a3b8;vertical-align:top;">Scope</td><td style="padding:4px 0;">' + escapeHtml(scope || "-") + '</td></tr>' +
          '<tr><td style="padding:4px 0;color:#94a3b8;">Keys/Alarm</td><td style="padding:4px 0;color:#b45309;font-weight:700;">' + escapeHtml(keysAlarm || "No") + '</td></tr>' +
          '</table>' +
          '</td>' +
          '<td style="padding:22px;vertical-align:top;text-align:right;white-space:nowrap;width:160px;">' +
          '<div style="font-size:20px;font-weight:900;color:#003b7a;margin-bottom:16px;">' + escapeHtml(formatMoney(proposedPay)) + '</div>' +
          '<a href="' + acceptUrl + '" style="display:block;background:#15803d;color:white;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:900;font-size:13px;margin-bottom:8px;">Accept</a>' +
          '<a href="' + declineUrl + '" style="display:block;background:#b91c1c;color:white;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:900;font-size:13px;">Decline</a>' +
          '</td>' +
          '</tr>' +
          '</table>'
        );
      })
      .join("");

    var notesEmailUrl =
      "mailto:info@cleaningworldinc.com,crm@cleaningworldinc.com" +
      "?subject=" +
      encodeURIComponent("Notes for Transfer Proposal " + proposalId) +
      "&body=" +
      encodeURIComponent(
        "Proposal ID: " + proposalId +
          "\nSubcontractor: " + subcontractorName +
          "\n\nNotes / Questions:"
      );

    var subject = "Cleaning World Account Transfer Proposal - " + subcontractorName;

    var plainBody =
      "Hi " + subcontractorName + ",\n\n" +
      "Cleaning World is sending you the following account transfer proposal for review.\n\n" +
      "Proposal ID: " + proposalId + "\n\n" +
      "Accounts included:\n\n" + plainAccountLines +
      "\nTotal Proposed Subcontractor Pay: " + formatMoney(totalProposedPay) + "\n\n" +
      "Important: If keys or alarm are required, details will be provided only after the account is accepted and approved.\n\n" +
      "Thank you,\nCleaning World Operations";

    var htmlBody =
      '<div style="margin:0;padding:0;background:#eef4fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">' +
      '<div style="max-width:680px;margin:0 auto;padding:24px;">' +

      '<div style="background:linear-gradient(135deg,#003b7a 0%,#005bbb 55%,#00a8e8 100%);border-radius:24px;padding:28px;color:white;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="background:white;border-radius:16px;padding:10px;width:130px;height:70px;text-align:center;vertical-align:middle;">' +
      '<img src="' + CLEANING_WORLD_LOGO_URL + '" alt="Cleaning World" style="max-width:100%;max-height:100%;" />' +
      '</td>' +
      '<td style="padding-left:16px;">' +
      '<div style="font-size:27px;font-weight:900;line-height:1;">Cleaning World</div>' +
      '<div style="font-size:14px;font-weight:700;margin-top:6px;color:rgba(255,255,255,0.92);">Account Transfer Proposal</div>' +
      '</td></tr></table>' +
      '</div>' +

      '<div style="background:white;border-radius:24px;margin-top:18px;padding:28px;border:1px solid #dbeafe;">' +
      '<h2 style="margin:0 0 8px;font-size:22px;color:#003b7a;">Hi ' + escapeHtml(subcontractorName) + '</h2>' +
      '<p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">Please review each account below. You can accept or decline each account individually.</p>' +

      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:26px;"><tr>' +
      '<td style="background:#eff6ff;border-radius:16px;padding:18px;width:50%;">' +
      '<div style="font-size:12px;color:#1d4ed8;font-weight:700;">PROPOSAL ID</div>' +
      '<div style="font-size:19px;color:#003b7a;font-weight:900;margin-top:4px;">' + escapeHtml(proposalId) + '</div>' +
      '</td>' +
      '<td style="width:12px;"></td>' +
      '<td style="background:#f0fdf4;border-radius:16px;padding:18px;width:50%;">' +
      '<div style="font-size:12px;color:#166534;font-weight:700;">TOTAL PROPOSED PAY</div>' +
      '<div style="font-size:19px;color:#166534;font-weight:900;margin-top:4px;">' + escapeHtml(formatMoney(totalProposedPay)) + '</div>' +
      '</td>' +
      '</tr></table>' +

      htmlAccountCards +

      '<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:16px;padding:16px;margin-top:8px;color:#7c2d12;font-size:13px;line-height:1.6;">' +
      "<strong>Important:</strong> If keys or alarm are required, details will be provided only after that account is accepted and approved by Cleaning World." +
      '</div>' +

      '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:16px;margin-top:16px;font-size:13px;line-height:1.6;">' +
      "<strong>Proposal Notes:</strong><br>" +
      '<div style="margin-top:6px;white-space:pre-wrap;color:#334155;">' + escapeHtml(proposal.notes || "-") + '</div>' +
      '</div>' +

      '<div style="text-align:center;margin-top:26px;">' +
      '<a href="' + notesEmailUrl + '" style="display:inline-block;background:#003b7a;color:white;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:900;">Send Notes / Questions</a>' +
      '</div>' +

      '<p style="font-size:12px;color:#64748b;line-height:1.6;margin-top:22px;">Clicking Accept or Decline records the response for that account and notifies Cleaning World. It does not automatically move the account until Cleaning World completes final approval.</p>' +

      '<p style="margin-top:20px;">Thank you,<br><strong>Cleaning World Operations</strong></p>' +
      '</div>' +
      '</div>' +
      '</div>';

    MailApp.sendEmail({
      to: subcontractorEmail,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: "Cleaning World App",
    });

    if (proposalId && proposalId !== "Proposal") {
      markSubTransferProposalSent(proposalId);
    }

    if (typeof logEmailEvent === "function") {
      logEmailEvent({
        accountName: proposal.accountNames || "",
        accountId: proposal.accountIds || "",
        emailType: "Sub Transfer Proposal",
        sentTo: subcontractorEmail,
        subject: subject,
        status: "Sent",
        relatedId: proposalId,
        triggeredBy: proposal.createdBy || "Andres",
        source: "Apps Script - sendSubTransferProposalEmail",
        notes: "Subcontractor transfer proposal sent with per-account accept/decline buttons.",
      });
    }

    return {
      success: true,
      proposalId: proposalId,
      sentTo: subcontractorEmail,
      message: "Subcontractor transfer proposal sent successfully.",
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to send transfer proposal email: " + error,
    };
  }
}
function getSubTransferProposals() {
  const sheet = getSubTransferProposalSheet();
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0].map(function (header) {
    return String(header || "").trim();
  });

  function getValue(row, possibleHeaders) {
    for (var i = 0; i < possibleHeaders.length; i++) {
      const possibleHeader = String(possibleHeaders[i] || "")
        .toLowerCase()
        .trim();

      const index = headers.findIndex(function (header) {
        return String(header || "").toLowerCase().trim() === possibleHeader;
      });

      if (index !== -1) {
        return row[index] || "";
      }
    }

    return "";
  }

  const grouped = {};

  values.slice(1).forEach(function (row, index) {
    const proposalId =
      getValue(row, ["Proposal ID", "proposalId", "ID", "id"]) ||
      "PROPOSAL-" + String(index + 2);

    if (!grouped[proposalId]) {
      grouped[proposalId] = {
        id: proposalId,
        proposalId: proposalId,
        createdAt: getValue(row, ["Created At", "createdAt", "Date", "Timestamp"]),
        status: getValue(row, ["Status", "status"]) || "Draft",
        newSubcontractor: getValue(row, [
          "New Subcontractor",
          "Subcontractor Name",
          "subcontractorName",
          "newSubcontractor",
        ]),
        newSubcontractorEmail: getValue(row, [
          "New Subcontractor Email",
          "Subcontractor Email",
          "subcontractorEmail",
          "newSubcontractorEmail",
          "Email",
        ]),
        totalMonthlyRevenue: "",
        proposedMonthlyPay: 0,
        notes: getValue(row, ["Notes", "notes"]),
        acceptedAt: getValue(row, ["Accepted At", "acceptedAt"]),
        declinedAt: getValue(row, ["Declined At", "declinedAt"]),
        sentAt: getValue(row, ["Sent At", "sentAt"]),
        accountCount: 0,
        accounts: [],
        rowNumber: index + 2,
      };
    }

    const accountName = getValue(row, ["Account Name", "Account", "accountName"]);
    const proposedPay = Number(
      parseTransferMoney(
        getValue(row, [
          "Proposed Monthly Pay",
          "Total Proposed Pay",
          "proposedMonthlyPay",
        ])
      )
    );

    if (accountName) {
      grouped[proposalId].accounts.push({
        accountName: accountName,
        address: getValue(row, ["Address", "address"]),
        cleaningDays: getValue(row, ["Cleaning Days", "cleaningDays", "Frequency"]),
        scope: getValue(row, ["Scope", "scope"]),
        keysAlarm: getValue(row, ["Keys / Alarm", "keysAlarm"]),
        proposedMonthlyPay: proposedPay,
      });

      grouped[proposalId].accountCount++;
      grouped[proposalId].proposedMonthlyPay += proposedPay;
    }
  });

  const proposals = Object.keys(grouped).map(function (proposalId) {
    const proposal = grouped[proposalId];

    proposal.proposedMonthlyPay = String(proposal.proposedMonthlyPay || 0);
    proposal.accountsJson = JSON.stringify(proposal.accounts || []);

    return proposal;
  });

  proposals.reverse();

  return proposals;
}

function markSubTransferProposalSent(proposalId) {
  const sheet = getSubTransferProposalSheet();
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) return false;

  const headers = values[0];
  const headerMap = getHeaderMap(headers);

  const idCol = findColumn(headerMap, ["Proposal ID"]);
  const statusCol = findColumn(headerMap, ["Status"]);
  const sentAtCol = findColumn(headerMap, ["Sent At"]);

  if (idCol === -1) return false;

  const statusCells = []; const sentAtCells = []; for (let i = 1; i < values.length; i++) { const rowProposalId = String(values[i][idCol] || "").trim(); if (rowProposalId === String(proposalId || "").trim()) { if (statusCol !== -1) { statusCells.push(sheet.getRange(i + 1, statusCol + 1).getA1Notation()); } if (sentAtCol !== -1) { sentAtCells.push(sheet.getRange(i + 1, sentAtCol + 1).getA1Notation()); } } } if (statusCells.length > 0) { sheet.getRangeList(statusCells).setValue("Sent"); } if (sentAtCells.length > 0) { sheet.getRangeList(sentAtCells).setValue(new Date()); }

  return true;
}

function respondSubTransferProposal(params) {
  try {
    const proposalId = String(params.proposalId || params.id || "").trim();
    const response = String(params.response || params.status || "")
      .toLowerCase()
      .trim();

    if (!proposalId) {
      return HtmlService.createHtmlOutput(
        "<h2>Missing Proposal ID</h2><p>Please contact Cleaning World.</p>"
      );
    }

    if (response !== "accepted" && response !== "declined") {
      return HtmlService.createHtmlOutput(
        "<h2>Invalid Response</h2><p>Please contact Cleaning World.</p>"
      );
    }

    const sheet = getSubTransferProposalSheet();
    const values = sheet.getDataRange().getValues();

    if (!values || values.length < 2) {
      return HtmlService.createHtmlOutput(
        "<h2>Proposal not found</h2><p>Please contact Cleaning World.</p>"
      );
    }

    const headers = values[0];
    const headerMap = getHeaderMap(headers);

    const idCol = findColumn(headerMap, ["Proposal ID"]);
    const statusCol = findColumn(headerMap, ["Status"]);
    const acceptedAtCol = findColumn(headerMap, ["Accepted At"]);
    const declinedAtCol = findColumn(headerMap, ["Declined At"]);
    const newSubCol = findColumn(headerMap, ["New Subcontractor"]);
    const newSubEmailCol = findColumn(headerMap, ["New Subcontractor Email"]);
    const accountNameCol = findColumn(headerMap, ["Account Name"]);
    const addressCol = findColumn(headerMap, ["Address"]);
    const proposedPayCol = findColumn(headerMap, ["Proposed Monthly Pay"]);
    const notesCol = findColumn(headerMap, ["Notes"]);

    if (idCol === -1) {
      return HtmlService.createHtmlOutput(
        "<h2>Proposal ID column missing</h2><p>Please contact Cleaning World.</p>"
      );
    }

    const now = new Date();
    const finalStatus = response === "accepted" ? "Accepted" : "Declined";
    const matchedRows = [];

    for (let i = 1; i < values.length; i++) {
      const rowProposalId = String(values[i][idCol] || "").trim();

      if (rowProposalId === proposalId) {
        matchedRows.push({
          rowNumber: i + 1,
          row: values[i],
        });

        if (statusCol !== -1) {
          sheet.getRange(i + 1, statusCol + 1).setValue(finalStatus);
        }

        if (response === "accepted" && acceptedAtCol !== -1) {
          sheet.getRange(i + 1, acceptedAtCol + 1).setValue(now);
        }

        if (response === "declined" && declinedAtCol !== -1) {
          sheet.getRange(i + 1, declinedAtCol + 1).setValue(now);
        }
      }
    }

    if (matchedRows.length === 0) {
      return HtmlService.createHtmlOutput(
        "<h2>Proposal not found</h2><p>Please contact Cleaning World.</p>"
      );
    }

    const firstRow = matchedRows[0].row;

    const newSubcontractor =
      newSubCol !== -1 ? String(firstRow[newSubCol] || "").trim() : "";

    const newSubcontractorEmail =
      newSubEmailCol !== -1 ? String(firstRow[newSubEmailCol] || "").trim() : "";

    const notes = notesCol !== -1 ? String(firstRow[notesCol] || "").trim() : "";

    const accountsText = matchedRows
      .map(function (item, index) {
        const row = item.row;

        const accountName =
          accountNameCol !== -1 ? String(row[accountNameCol] || "").trim() : "";

        const address =
          addressCol !== -1 ? String(row[addressCol] || "").trim() : "";

        const proposedPay =
          proposedPayCol !== -1
            ? String(row[proposedPayCol] || "").trim()
            : "";

        return (
          index +
          1 +
          ". " +
          (accountName || "-") +
          "\nAddress: " +
          (address || "-") +
          "\nProposed Monthly Pay: " +
          (proposedPay || "-")
        );
      })
      .join("\n\n");

    const subject =
      "Transfer Proposal " + finalStatus + " - " + proposalId;

    const plainBody =
      "A subcontractor responded to a transfer proposal.\n\n" +
      "Proposal ID: " +
      proposalId +
      "\n" +
      "Response: " +
      finalStatus +
      "\n" +
      "Subcontractor: " +
      (newSubcontractor || "-") +
      "\n" +
      "Subcontractor Email: " +
      (newSubcontractorEmail || "-") +
      "\n\n" +
      "Accounts:\n" +
      accountsText +
      "\n\nNotes:\n" +
      (notes || "-");

    const htmlBody =
      '<div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:24px;color:#0f172a;">' +
      '<div style="max-width:720px;margin:0 auto;background:white;border-radius:18px;padding:24px;border:1px solid #dbeafe;">' +
      '<h2 style="margin-top:0;color:#003b7a;">Transfer Proposal ' +
      escapeHtml(finalStatus) +
      "</h2>" +
      "<p><strong>Proposal ID:</strong> " +
      escapeHtml(proposalId) +
      "</p>" +
      "<p><strong>Response:</strong> " +
      escapeHtml(finalStatus) +
      "</p>" +
      "<p><strong>Subcontractor:</strong> " +
      escapeHtml(newSubcontractor || "-") +
      "</p>" +
      "<p><strong>Subcontractor Email:</strong> " +
      escapeHtml(newSubcontractorEmail || "-") +
      "</p>" +
      '<pre style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:14px;white-space:pre-wrap;">' +
      escapeHtml(accountsText || "-") +
      "</pre>" +
      "<p><strong>Notes:</strong><br>" +
      escapeHtml(notes || "-") +
      "</p>" +
      "</div></div>";

    MailApp.sendEmail({
      to: TRANSFER_RESPONSE_NOTIFICATION_EMAILS,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: "Cleaning World App",
    });

    if (typeof logEmailEvent === "function") {
      logEmailEvent({
        accountName: matchedRows
          .map(function (item) {
            return accountNameCol !== -1
              ? String(item.row[accountNameCol] || "").trim()
              : "";
          })
          .filter(String)
          .join(", "),
        accountId: "",
        emailType: "Sub Transfer Proposal Response",
        sentTo: TRANSFER_RESPONSE_NOTIFICATION_EMAILS,
        subject: subject,
        status: "Sent",
        relatedId: proposalId,
        triggeredBy: newSubcontractor || "Subcontractor",
        source: "Apps Script - respondSubTransferProposal",
        notes: "Subcontractor response recorded as " + finalStatus + ".",
      });
    }

    const responseColor = response === "accepted" ? "#15803d" : "#b91c1c";

    return HtmlService.createHtmlOutput(
      '<div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;min-height:100vh;padding:30px;color:#0f172a;">' +
        '<div style="max-width:680px;margin:0 auto;background:white;border-radius:20px;padding:28px;border:1px solid #dbeafe;text-align:center;">' +
        '<h1 style="color:' +
        responseColor +
        ';margin-top:0;">Thank you</h1>' +
        "<p>Your response has been recorded as:</p>" +
        '<div style="display:inline-block;background:' +
        responseColor +
        ';color:white;font-weight:900;padding:12px 18px;border-radius:12px;margin:10px 0;">' +
        escapeHtml(finalStatus) +
        "</div>" +
        "<p><strong>Proposal ID:</strong> " +
        escapeHtml(proposalId) +
        "</p>" +
        "<p>Cleaning World has been notified. Final account transfer will be completed by Cleaning World after review.</p>" +
        '<p style="margin-top:24px;"><a href="mailto:info@cleaningworldinc.com,crm@cleaningworldinc.com?subject=' +
        encodeURIComponent("Notes for Transfer Proposal " + proposalId) +
        '" style="color:#003b7a;font-weight:900;">Send Notes / Questions</a></p>' +
        "</div></div>"
    );
  } catch (error) {
    return HtmlService.createHtmlOutput(
      "<h2>Something went wrong</h2><p>Please contact Cleaning World.</p><p>" +
        escapeHtml(String(error)) +
        "</p>"
    );
  }
}

function getSubPortalIssues() {
  var sheet = ensureSubPortalIssuesSheet_();
  var values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      success: true,
      issues: [],
      newCount: 0,
      message: "No sub portal issues found.",
    };
  }

  var headers = values[0];
  var headerMap = getHeaderMap(headers);

  var issues = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];

    var issue = {
      rowNumber: r + 1,
      timestamp: formatDateForApp(getCell(row, headerMap, ["Timestamp"])),
      issueId: String(
        getCell(row, headerMap, ["Issue ID", "IssueId", "ID"]) || ""
      ).trim(),
      subcontractorEmail: String(
        getCell(row, headerMap, [
          "Subcontractor Email",
          "Sub Email",
          "Email",
        ]) || ""
      ).trim(),
      subcontractorName: String(
        getCell(row, headerMap, [
          "Subcontractor Name",
          "Subcontractor",
          "Sub Name",
        ]) || ""
      ).trim(),
      accountId: String(
        getCell(row, headerMap, ["Account ID", "AccountId"]) || ""
      ).trim(),
      accountName: String(
        getCell(row, headerMap, ["Account Name", "Account"]) || ""
      ).trim(),
      issueType: String(
        getCell(row, headerMap, ["Issue Type", "Type"]) || ""
      ).trim(),
      urgency: String(
        getCell(row, headerMap, ["Urgency", "Priority"]) || ""
      ).trim(),
      description: String(
        getCell(row, headerMap, ["Description", "Issue", "Notes"]) || ""
      ).trim(),
      photoCount: String(
        getCell(row, headerMap, ["Photo Count", "Photos"]) || ""
      ).trim(),
      status: String(getCell(row, headerMap, ["Status"]) || "New").trim(),
      notes: String(getCell(row, headerMap, ["Notes"]) || "").trim(),
    };

    if (issue.issueId || issue.accountName || issue.description) {
      issues.push(issue);
    }
  }

  issues.sort(function (a, b) {
    return Number(b.rowNumber || 0) - Number(a.rowNumber || 0);
  });

  var newCount = issues.filter(function (issue) {
    var status = String(issue.status || "").toLowerCase().trim();
    return !status || status === "new" || status === "open";
  }).length;

  return {
    success: true,
    issues: issues,
    newCount: newCount,
    message: "Sub portal issues loaded.",
  };
}

function updateSubPortalIssueStatus(body) {
  var sheet = ensureSubPortalIssuesSheet_();
  var values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("No sub portal issues found.");
  }

  var headers = values[0];
  var headerMap = getHeaderMap(headers);

  var issueIdToFind = String(body.issueId || body.id || "").trim();
  var rowNumber = Number(body.rowNumber || 0);
  var newStatus = String(body.status || "Reviewed").trim();
  var noteToAdd = String(body.notes || body.note || "").trim();

  if (!issueIdToFind && !rowNumber) {
    throw new Error("Missing issue ID or row number.");
  }

  var statusCol = findColumn(headerMap, ["Status"]);
  var notesCol = findColumn(headerMap, ["Notes"]);

  if (statusCol === -1) {
    throw new Error("Status column was not found in Sub Portal Issues.");
  }

  var targetRowNumber = 0;

  if (rowNumber && rowNumber >= 2) {
    targetRowNumber = rowNumber;
  } else {
    var issueIdCol = findColumn(headerMap, ["Issue ID", "IssueId", "ID"]);

    if (issueIdCol === -1) {
      throw new Error("Issue ID column was not found in Sub Portal Issues.");
    }

    for (var r = 1; r < values.length; r++) {
      var rowIssueId = String(values[r][issueIdCol] || "").trim();

      if (rowIssueId === issueIdToFind) {
        targetRowNumber = r + 1;
        break;
      }
    }
  }

  if (!targetRowNumber) {
    throw new Error("Could not find sub portal issue: " + issueIdToFind);
  }

  sheet.getRange(targetRowNumber, statusCol + 1).setValue(newStatus);

  if (notesCol !== -1 && noteToAdd) {
    var existingNotes = String(
      sheet.getRange(targetRowNumber, notesCol + 1).getValue() || ""
    ).trim();

    var stampedNote =
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd HH:mm"
      ) +
      " - " +
      noteToAdd;

    sheet
      .getRange(targetRowNumber, notesCol + 1)
      .setValue(
        existingNotes ? existingNotes + "\n" + stampedNote : stampedNote
      );
  }

  return {
    success: true,
    message: "Sub portal issue status updated.",
    issueId: issueIdToFind,
    rowNumber: targetRowNumber,
    status: newStatus,
  };
}
function getPhotos() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Photos");

  if (!sheet) {
    return [];
  }

  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0];
  const headerMap = getHeaderMap(headers);
  const rows = values.slice(1);

  return rows
    .map(function (row, index) {
      return {
        rowNumber: index + 2,
        timestamp: formatDateForApp(
          getCell(row, headerMap, ["Timestamp", "Date", "Created At"])
        ),
        photoId: String(
          getCell(row, headerMap, ["Photo ID", "PhotoId", "ID"]) || ""
        ).trim(),
        accountId: String(
          getCell(row, headerMap, ["Account ID", "AccountId"]) || ""
        ).trim(),
        accountName: String(
          getCell(row, headerMap, ["Account Name", "Account"]) || ""
        ).trim(),
        sourceType: String(
          getCell(row, headerMap, ["Source Type", "SourceType"]) || ""
        ).trim(),
        sourceId: String(
          getCell(row, headerMap, ["Source ID", "SourceId", "Related ID"]) || ""
        ).trim(),
        uploadedBy: String(
          getCell(row, headerMap, ["Uploaded By", "UploadedBy"]) || ""
        ).trim(),
        userRole: String(
          getCell(row, headerMap, ["User Role", "UserRole"]) || ""
        ).trim(),
        fileName: String(
          getCell(row, headerMap, ["File Name", "FileName"]) || ""
        ).trim(),
        driveFileId: String(
          getCell(row, headerMap, ["Drive File ID", "DriveFileId"]) || ""
        ).trim(),
        driveUrl: String(
          getCell(row, headerMap, ["Drive URL", "DriveUrl", "File URL"]) || ""
        ).trim(),
        folderUrl: String(
          getCell(row, headerMap, ["Folder URL", "FolderUrl"]) || ""
        ).trim(),
        notes: String(
          getCell(row, headerMap, ["Notes", "Note", "Comments"]) || ""
        ).trim(),
        status: String(
          getCell(row, headerMap, ["Status"]) || ""
        ).trim(),
      };
    })
    .filter(function (photo) {
      return photo.sourceId && photo.driveUrl;
    });
}
function getPhotoFile(fileId) {
  const cleanFileId = String(fileId || "").trim();

  if (!cleanFileId) {
    return {
      success: false,
      error: "Missing fileId.",
    };
  }

  try {
    const file = DriveApp.getFileById(cleanFileId);
    const blob = file.getBlob();

    return {
      success: true,
      fileId: cleanFileId,
      fileName: file.getName(),
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes()),
    };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}
function resendComplaintNotification(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Complaints"); // adjust tab name if different
  if (!sheet) {
    return { success: false, error: "Complaints sheet not found." };
  }

  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });

  function colIndex(names) {
    for (var i = 0; i < names.length; i++) {
      var idx = headers.indexOf(names[i]);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  var idCol = colIndex(["ID", "Complaint ID", "id"]);
  var rowNumberParam = data.rowNumber ? Number(data.rowNumber) : null;
  var idParam = data.id ? String(data.id).trim() : "";

  var targetRowIndex = -1; // 0-based index into `values`, includes header row

  // Same resolution order as updateComplaint: rowNumber first, then ID column.
  if (rowNumberParam && rowNumberParam >= 2 && rowNumberParam <= values.length) {
    targetRowIndex = rowNumberParam - 1;
  } else if (idParam && idCol !== -1) {
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]).trim() === idParam) {
        targetRowIndex = r;
        break;
      }
    }
  }

  if (targetRowIndex === -1) {
    return { success: false, error: "Complaint not found." };
  }

  var row = values[targetRowIndex];

  function getCol(names) {
    var idx = colIndex(names);
    return idx !== -1 ? String(row[idx] || "").trim() : "";
  }

  // Re-read fresh from the sheet — don't trust stale frontend data, the
  // complaint may have been edited since it was created. Candidate lists
  // match getComplaints() in this same file exactly.
  var accountId = getCol(["Account ID", "accountId"]);
  var accountName = getCol(["Account Name", "accountName"]);
  var subcontractor = getCol(["Subcontractor", "Sub Contractor", "Cleaner", "Sub", "Sub Name"]);
  var issue = getCol(["Description", "Complaint", "Issue"]);
  var priority = getCol(["Priority", "priority", "Severity", "severity"]);
  var manager = getCol(["Assigned To", "assignedTo", "Manager", "manager"]);

  var freshComplaint = {
    accountId: accountId,
    accountName: accountName,
    subcontractor: subcontractor,
    issue: issue,
    description: issue,
    priority: priority,
    severity: priority,
    manager: manager,
    assignedTo: manager,

    "Account ID": accountId,
    "Account Name": accountName,
    Subcontractor: subcontractor,
    Issue: issue,
    Priority: priority,
    "Assigned To": manager,
  };

  // Reuses the EXISTING function directly — no duplicated lookup/send logic.
  var subcontractorEmailSent = sendComplaintNotificationToSubcontractor(freshComplaint);

  return {
    success: true,
    notification: {
      sent: subcontractorEmailSent,
      reason: subcontractorEmailSent
        ? undefined
        : (subcontractor
            ? "No matching subcontractor email found for \"" + subcontractor + "\"."
            : "No subcontractor on file for this account."),
    },
  };
}
