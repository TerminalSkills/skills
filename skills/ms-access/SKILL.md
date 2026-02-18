---
name: ms-access
description: >-
  Build and manage Microsoft Access databases, queries, forms, reports, and VBA automation.
  Use when someone asks to "create Access database", "write Access queries", "build Access forms",
  "Access VBA macro", "migrate from Access", "Access report", "link Access to SQL Server",
  or "convert Access to web app". Covers table design, relationships, SQL queries, forms, reports,
  VBA automation, and migration strategies to modern platforms.
license: Apache-2.0
compatibility: "Microsoft Access 2016+, Microsoft 365 Access. Windows only."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["microsoft-access", "database", "vba", "forms", "reports", "sql", "migration"]
---

# Microsoft Access

## Overview

This skill helps AI agents work with Microsoft Access databases — designing tables, writing queries, building forms and reports, automating with VBA, and planning migrations to modern platforms. Access is widely used in small businesses and departments for data management, and agents should know how to build, maintain, and eventually migrate these systems.

## Instructions

### Step 1: Database Design

#### Table Design Best Practices
```
Table: Customers
  CustomerID    AutoNumber (Primary Key)
  FirstName     Short Text (50)
  LastName      Short Text (50)
  Email         Short Text (100), Indexed (No Duplicates)
  Phone         Short Text (20)
  Company       Short Text (100)
  CreatedDate   Date/Time, Default: =Now()
  IsActive      Yes/No, Default: Yes

Table: Orders
  OrderID       AutoNumber (Primary Key)
  CustomerID    Long Integer (Foreign Key → Customers)
  OrderDate     Date/Time, Default: =Date()
  TotalAmount   Currency
  Status        Short Text (20), Validation Rule: In ("Pending","Shipped","Delivered","Cancelled")
  Notes         Long Text

Table: OrderItems
  ItemID        AutoNumber (Primary Key)
  OrderID       Long Integer (Foreign Key → Orders)
  ProductID     Long Integer (Foreign Key → Products)
  Quantity      Integer, Validation Rule: >0
  UnitPrice     Currency
  Discount      Double, Default: 0

Table: Products
  ProductID     AutoNumber (Primary Key)
  ProductName   Short Text (100)
  Category      Short Text (50)
  UnitPrice     Currency
  UnitsInStock  Integer, Default: 0
  ReorderLevel  Integer, Default: 10
  Discontinued  Yes/No, Default: No
```

**Design rules:**
- Always use AutoNumber for primary keys
- Set data types appropriately (Short Text with length limits, Currency for money)
- Add validation rules at table level (not just form level)
- Set default values where logical
- Create indexes on frequently queried fields
- Use Lookup fields sparingly (they hide complexity)

#### Relationships
```
Relationships window:
  Customers (1) ──── (∞) Orders         → One customer has many orders
  Orders (1) ──────── (∞) OrderItems    → One order has many items
  Products (1) ─────── (∞) OrderItems   → One product in many order items

Enforce referential integrity: YES
Cascade Update: YES
Cascade Delete: NO (prevent accidental data loss)
```

### Step 2: Queries (SQL in Access)

#### Select Queries
```sql
-- Basic query with join
SELECT c.FirstName, c.LastName, o.OrderDate, o.TotalAmount
FROM Customers c
INNER JOIN Orders o ON c.CustomerID = o.CustomerID
WHERE o.OrderDate >= #2026-01-01#
ORDER BY o.OrderDate DESC;

-- Aggregate: total sales per customer
SELECT c.CustomerID, c.FirstName & " " & c.LastName AS FullName,
       Count(o.OrderID) AS OrderCount,
       Sum(o.TotalAmount) AS TotalSpent,
       Avg(o.TotalAmount) AS AvgOrder
FROM Customers c
INNER JOIN Orders o ON c.CustomerID = o.CustomerID
GROUP BY c.CustomerID, c.FirstName & " " & c.LastName
HAVING Sum(o.TotalAmount) > 1000
ORDER BY TotalSpent DESC;

-- Crosstab query: monthly sales by category
TRANSFORM Sum(oi.Quantity * oi.UnitPrice) AS Revenue
SELECT p.Category
FROM Products p
INNER JOIN OrderItems oi ON p.ProductID = oi.ProductID
INNER JOIN Orders o ON oi.OrderID = o.OrderID
WHERE o.OrderDate Between #2026-01-01# And #2026-12-31#
GROUP BY p.Category
PIVOT Format(o.OrderDate, "yyyy-mm");

-- Top N query
SELECT TOP 10 p.ProductName, Sum(oi.Quantity) AS TotalSold
FROM Products p
INNER JOIN OrderItems oi ON p.ProductID = oi.ProductID
GROUP BY p.ProductName
ORDER BY Sum(oi.Quantity) DESC;

-- Subquery: customers who haven't ordered in 90 days
SELECT c.CustomerID, c.FirstName, c.LastName, c.Email
FROM Customers c
WHERE c.CustomerID NOT IN (
    SELECT DISTINCT o.CustomerID
    FROM Orders o
    WHERE o.OrderDate >= DateAdd("d", -90, Date())
)
AND c.IsActive = True;
```

#### Action Queries
```sql
-- Update query: mark overdue orders
UPDATE Orders
SET Status = "Overdue"
WHERE Status = "Pending"
AND OrderDate < DateAdd("d", -30, Date());

-- Append query: archive old orders
INSERT INTO ArchivedOrders
SELECT * FROM Orders
WHERE OrderDate < DateAdd("yyyy", -2, Date());

-- Delete query: remove archived records
DELETE FROM Orders
WHERE OrderDate < DateAdd("yyyy", -2, Date())
AND OrderID IN (SELECT OrderID FROM ArchivedOrders);

-- Make-table query: create summary table
SELECT Year(o.OrderDate) AS OrderYear,
       Month(o.OrderDate) AS OrderMonth,
       Count(o.OrderID) AS OrderCount,
       Sum(o.TotalAmount) AS Revenue
INTO MonthlySummary
FROM Orders o
GROUP BY Year(o.OrderDate), Month(o.OrderDate);
```

#### Parameter Queries
```sql
-- Prompt user for date range
SELECT o.OrderID, c.LastName, o.OrderDate, o.TotalAmount
FROM Orders o
INNER JOIN Customers c ON o.CustomerID = c.CustomerID
WHERE o.OrderDate Between [Enter Start Date:] And [Enter End Date:]
ORDER BY o.OrderDate;
```

### Step 3: Forms

#### Form Design Principles
```
Main form types:
  - Data entry form: bound to single table, tab order set, validation
  - Navigation form: menu/dashboard with buttons to open other forms
  - Search form: unbound with search criteria, results in subform
  - Main/subform: parent record with child records (e.g., Order + OrderItems)

Key properties:
  Record Source:     Table or query
  Allow Additions:   Yes/No
  Allow Deletions:   Yes/No
  Allow Edits:       Yes/No
  Navigation Buttons: No (build your own)
  Record Selectors:   No (cleaner UI)
  Scroll Bars:        Neither (design to fit)
```

#### Common Form VBA
```vba
' Search form: filter results
Private Sub btnSearch_Click()
    Dim strFilter As String
    
    If Not IsNull(Me.txtSearchName) Then
        strFilter = "LastName Like '*" & Me.txtSearchName & "*'"
    End If
    
    If Not IsNull(Me.cboStatus) Then
        If Len(strFilter) > 0 Then strFilter = strFilter & " AND "
        strFilter = strFilter & "Status = '" & Me.cboStatus & "'"
    End If
    
    If Not IsNull(Me.txtDateFrom) Then
        If Len(strFilter) > 0 Then strFilter = strFilter & " AND "
        strFilter = strFilter & "OrderDate >= #" & Format(Me.txtDateFrom, "mm/dd/yyyy") & "#"
    End If
    
    Me.subResults.Form.Filter = strFilter
    Me.subResults.Form.FilterOn = (Len(strFilter) > 0)
End Sub

' Before update validation
Private Sub Form_BeforeUpdate(Cancel As Integer)
    If IsNull(Me.txtEmail) Then
        MsgBox "Email is required.", vbExclamation
        Me.txtEmail.SetFocus
        Cancel = True
        Exit Sub
    End If
    
    ' Email format validation
    If Not Me.txtEmail Like "*@*.*" Then
        MsgBox "Please enter a valid email address.", vbExclamation
        Me.txtEmail.SetFocus
        Cancel = True
    End If
End Sub

' Auto-calculate total on subform
Private Sub Form_AfterUpdate()
    Me.Parent.txtOrderTotal = DSum("Quantity * UnitPrice", "OrderItems", "OrderID = " & Me.Parent.OrderID)
End Sub

' Open related form
Private Sub btnViewOrders_Click()
    DoCmd.OpenForm "frmOrders", , , "CustomerID = " & Me.CustomerID
End Sub
```

### Step 4: Reports

```vba
' Report with grouping and totals
' Design view setup:
'   Report Header: Title, date, logo
'   Page Header: Column headers
'   Group Header (Category): Category name
'   Detail: Individual records
'   Group Footer (Category): Subtotals
'   Report Footer: Grand totals
'   Page Footer: Page numbers

' Format report events
Private Sub Report_Open(Cancel As Integer)
    ' Set date range from form parameters
    Me.Filter = "OrderDate Between #" & Forms!frmReportParams!StartDate & _
                "# And #" & Forms!frmReportParams!EndDate & "#"
    Me.FilterOn = True
End Sub

Private Sub GroupFooter0_Format(Cancel As Integer, FormatCount As Integer)
    ' Highlight categories with low sales
    If Me.txtCategoryTotal < 1000 Then
        Me.txtCategoryTotal.ForeColor = vbRed
    End If
End Sub

' Export report to PDF
Private Sub btnExportPDF_Click()
    Dim fileName As String
    fileName = "SalesReport_" & Format(Date, "yyyy-mm-dd") & ".pdf"
    DoCmd.OutputTo acOutputReport, "rptMonthlySales", acFormatPDF, _
        "C:\Reports\" & fileName
    MsgBox "Report exported: " & fileName
End Sub
```

### Step 5: VBA Automation

```vba
' Import CSV data
Public Sub ImportCSV()
    Dim filePath As String
    filePath = "C:\Data\import.csv"
    
    DoCmd.TransferText acImportDelim, , "ImportedData", filePath, True
    
    ' Clean and move to main table
    CurrentDb.Execute "INSERT INTO Customers (FirstName, LastName, Email) " & _
        "SELECT Trim(FirstName), Trim(LastName), LCase(Trim(Email)) " & _
        "FROM ImportedData " & _
        "WHERE Email NOT IN (SELECT Email FROM Customers)"
    
    ' Clean up
    CurrentDb.Execute "DROP TABLE ImportedData"
    MsgBox "Import complete.", vbInformation
End Sub

' Export to Excel
Public Sub ExportToExcel()
    Dim xlApp As Object
    Dim xlWb As Object
    Dim xlWs As Object
    Dim rs As DAO.Recordset
    Dim i As Integer
    
    Set xlApp = CreateObject("Excel.Application")
    Set xlWb = xlApp.Workbooks.Add
    Set xlWs = xlWb.Sheets(1)
    
    Set rs = CurrentDb.OpenRecordset("qryMonthlySales")
    
    ' Headers
    For i = 0 To rs.Fields.Count - 1
        xlWs.Cells(1, i + 1).Value = rs.Fields(i).Name
        xlWs.Cells(1, i + 1).Font.Bold = True
    Next i
    
    ' Data
    xlWs.Range("A2").CopyFromRecordset rs
    
    ' Auto-fit columns
    xlWs.Columns.AutoFit
    
    xlWb.SaveAs "C:\Reports\MonthlySales_" & Format(Date, "yyyy-mm") & ".xlsx"
    xlWb.Close
    xlApp.Quit
    
    Set rs = Nothing
    MsgBox "Export complete.", vbInformation
End Sub

' Send email from Access
Public Sub SendOverdueReminders()
    Dim rs As DAO.Recordset
    Dim olApp As Object
    Dim olMail As Object
    
    Set rs = CurrentDb.OpenRecordset( _
        "SELECT c.Email, c.FirstName, o.OrderID, o.OrderDate, o.TotalAmount " & _
        "FROM Customers c INNER JOIN Orders o ON c.CustomerID = o.CustomerID " & _
        "WHERE o.Status = 'Overdue'")
    
    Set olApp = CreateObject("Outlook.Application")
    
    Do While Not rs.EOF
        Set olMail = olApp.CreateItem(0)
        With olMail
            .To = rs!Email
            .Subject = "Payment Reminder - Order #" & rs!OrderID
            .HTMLBody = "<p>Dear " & rs!FirstName & ",</p>" & _
                "<p>This is a reminder that your order #" & rs!OrderID & _
                " from " & Format(rs!OrderDate, "mmmm d, yyyy") & _
                " ($" & Format(rs!TotalAmount, "#,##0.00") & _
                ") is overdue.</p><p>Please arrange payment at your earliest convenience.</p>"
            .Send
        End With
        rs.MoveNext
    Loop
    
    rs.Close
    MsgBox "Reminders sent.", vbInformation
End Sub

' Compact and repair database
Public Sub CompactDB()
    Dim dbPath As String
    Dim tempPath As String
    
    dbPath = CurrentDb.Name
    tempPath = Replace(dbPath, ".accdb", "_temp.accdb")
    
    ' Close all objects
    DoCmd.Close
    
    DBEngine.CompactDatabase dbPath, tempPath
    Kill dbPath
    Name tempPath As dbPath
    
    Application.OpenCurrentDatabase dbPath
End Sub
```

### Step 6: Linked Tables (SQL Server / ODBC)

```vba
' Link to SQL Server tables
Public Sub LinkSQLServerTables()
    Dim tdf As DAO.TableDef
    Dim connStr As String
    
    connStr = "ODBC;DRIVER={ODBC Driver 17 for SQL Server};" & _
              "SERVER=myserver.database.windows.net;" & _
              "DATABASE=MyDB;" & _
              "UID=admin;" & _
              "PWD=password;" & _
              "Encrypt=yes;"
    
    ' Link Customers table
    Set tdf = CurrentDb.CreateTableDef("dbo_Customers")
    tdf.Connect = connStr
    tdf.SourceTableName = "dbo.Customers"
    CurrentDb.TableDefs.Append tdf
    
    ' Refresh links (when connection string changes)
    For Each tdf In CurrentDb.TableDefs
        If tdf.Connect <> "" Then
            tdf.Connect = connStr
            tdf.RefreshLink
        End If
    Next
End Sub
```

### Step 7: Migration Strategy

Access databases often need migration to modern platforms. Common paths:

| Current | Target | Best For |
|---------|--------|----------|
| Access tables | SQL Server / Azure SQL | Data grows beyond 2GB, multi-user |
| Access forms | Power Apps | Low-code, mobile access needed |
| Access reports | Power BI | Advanced analytics, dashboards |
| Access + VBA | Web app (Node/Python) | Internet access, API integrations |
| Everything | Dataverse + Power Platform | Full Microsoft ecosystem replacement |

```vba
' Export all tables to SQL Server
Public Sub MigrateToSQLServer()
    Dim tdf As DAO.TableDef
    Dim connStr As String
    
    connStr = "ODBC;DRIVER={ODBC Driver 17 for SQL Server};" & _
              "SERVER=myserver.database.windows.net;" & _
              "DATABASE=MyDB;Trusted_Connection=yes;"
    
    For Each tdf In CurrentDb.TableDefs
        If tdf.Attributes = 0 Then ' Local tables only
            DoCmd.TransferDatabase acExport, "ODBC Database", connStr, _
                acTable, tdf.Name, tdf.Name, False
            Debug.Print "Exported: " & tdf.Name
        End If
    Next
End Sub
```

## Best Practices

- Always compact and repair regularly — Access databases bloat over time
- Set the 2GB file size limit warning early — migrate before hitting it
- Split database: front-end (forms/queries) on user's machine, back-end (tables) on network share
- Back up .accdb files daily — no built-in replication or point-in-time recovery
- Use parameterized queries, not string concatenation — SQL injection applies to Access too
- Linked tables to SQL Server for multi-user scenarios (>5 concurrent users)
- Keep VBA in modules, not behind individual forms — easier to maintain and debug
- Error handling in every VBA procedure — `On Error GoTo ErrHandler`
- Document table relationships, validation rules, and VBA in a design document
- Plan migration early — Access is a prototyping tool, not an enterprise platform
